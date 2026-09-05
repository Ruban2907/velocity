import base64
import binascii
import tempfile
import re
import os
from flask import Flask, request, jsonify
from pypdf import PdfReader
from docx import Document

app = Flask(__name__)
# Protect against unbounded memory allocation from oversized uploads (10MB limit)
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024


def extract_text_fast(file_path: str, is_pdf: bool) -> str:
    """Fast text extraction path to reduce parsing latency."""
    if is_pdf:
        reader = PdfReader(file_path)
        pages = []
        for page in reader.pages:
            page_text = page.extract_text() or ""
            pages.append(page_text)
        return "\n".join(pages)

    doc = Document(file_path)
    paragraphs = [p.text for p in doc.paragraphs if p.text and p.text.strip()]
    return "\n".join(paragraphs)


def extract_text_fallback_unstructured(file_path: str, is_pdf: bool) -> str:
    """
    Fallback for difficult files.
    Imported lazily to avoid heavy startup cost on normal requests.
    """
    if is_pdf:
        from unstructured.partition.pdf import partition_pdf
        elements = partition_pdf(file_path)
    else:
        from unstructured.partition.docx import partition_docx
        elements = partition_docx(file_path)

    return "\n".join([str(e) for e in elements if hasattr(e, "text")])


def extract_fields(text: str):
    """Extract structured fields from resume text using regex and heuristics."""
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    
    # Extract name (first line, usually the name)
    name = lines[0] if lines and len(lines[0]) < 50 else None
    
    # Extract contact information
    email_match = re.search(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", text)
    email = email_match.group() if email_match else None
    
    phone_match = re.search(r"\+?\d[\d\s\-()]{7,}\d", text)
    phone = phone_match.group() if phone_match else None
    
    linkedin_match = re.search(r"(?:linkedin\.com/in/|linkedin\.com/in/)([\w\-]+)", text, re.IGNORECASE)
    linkedin = f"linkedin.com/in/{linkedin_match.group(1)}" if linkedin_match else None
    
    github_match = re.search(r"(?:github\.com/)([\w\-]+)", text, re.IGNORECASE)
    github = f"github.com/{github_match.group(1)}" if github_match else None
    
    contact = {
        "email": email,
        "phone": phone,
        "linkedin": linkedin,
        "github": github
    }
    
    # Extract education
    education = []
    education_section = False
    education_start_idx = -1
    
    # Find education section
    for i, line in enumerate(lines):
        if "EDUCATION" in line.upper():
            education_section = True
            education_start_idx = i
            break
    
    if education_section:
        # Process the line with "EDUCATION" - it might contain the institution
        edu_line = lines[education_start_idx] if education_start_idx < len(lines) else ""
        
        # Remove "EDUCATION" keyword and clean up
        edu_content = re.sub(r"EDUCATION\s*", "", edu_line, flags=re.IGNORECASE).strip()
        
        # Look for education entries starting from the EDUCATION line
        current_edu = {"institution": None, "degree": None, "years": None}
        edu_text_parts = []
        
        # Collect all lines in education section
        for i in range(education_start_idx, len(lines)):
            line = lines[i]
            
            # Stop if we hit another major section
            if i > education_start_idx and any(keyword in line.upper() for keyword in ["EXPERIENCE", "PROJECTS", "SKILLS", "TECHNICAL"]):
                break
            
            # Skip the "EDUCATION" header line itself
            if "EDUCATION" in line.upper() and i == education_start_idx:
                # Extract content after "EDUCATION"
                edu_content = re.sub(r"EDUCATION\s*", "", line, flags=re.IGNORECASE).strip()
                if edu_content:
                    edu_text_parts.append(edu_content)
            elif i > education_start_idx:
                edu_text_parts.append(line)
        
        # Combine all education text
        edu_text = " ".join(edu_text_parts)
        
        # Extract institution (usually comes first, before degree keywords)
        # Pattern: Institution name, then "Bachelor/Master/PhD", then "in/of", then field name
        degree_match = re.search(r"(Bachelor|Master|PhD|Ph\.D\.|B\.S\.|B\.A\.|M\.S\.|M\.A\.)\s+(?:of|in)\s+([^0-9]+)", edu_text, re.IGNORECASE)
        if degree_match:
            degree_type = degree_match.group(1)
            field = degree_match.group(2).strip()
            degree = f"{degree_type} of {field}"
            
            # Extract institution (text before the degree)
            institution_part = edu_text[:degree_match.start()].strip()
            # Remove common words and clean up
            institution = re.sub(r"^\s*(at|in|from)\s+", "", institution_part, flags=re.IGNORECASE).strip()
            # If institution contains commas, take the first part
            if "," in institution:
                institution = institution.split(",")[0].strip()
        else:
            # Fallback: try to find institution and degree separately
            # Look for common patterns
            parts = re.split(r"\s+(Bachelor|Master|PhD|Ph\.D\.|B\.S\.|B\.A\.|M\.S\.|M\.A\.)", edu_text, flags=re.IGNORECASE, maxsplit=1)
            if len(parts) >= 2:
                institution = parts[0].strip()
                degree = parts[1].strip() if len(parts) > 1 else None
            else:
                institution = edu_text.split(",")[0].strip() if "," in edu_text else edu_text.split()[0] if edu_text else None
                degree = None
        
        # Extract years (look for pattern like "2022 – 2026" or "2022-2026")
        years_match = re.search(r"(\d{4})\s*[–-]\s*(\d{4})", edu_text)
        years = years_match.group(0) if years_match else None
        
        # If years not found in combined text, check next line after education
        if not years and education_start_idx + 1 < len(lines):
            next_line = lines[education_start_idx + 1]
            years_match = re.search(r"(\d{4})\s*[–-]\s*(\d{4})", next_line)
            if years_match:
                years = years_match.group(0)
                # If we found years on next line, make sure we didn't include it in institution
                if institution and years in institution:
                    institution = institution.replace(years, "").strip()
        
        if institution or degree:
            education.append({
                "institution": institution,
                "degree": degree,
                "years": years
            })
    
    def section_slice(start_heading, end_headings):
        start = -1
        for idx, ln in enumerate(lines):
            if ln.upper().startswith(start_heading):
                start = idx + 1
                break
        if start == -1:
            return []
        end = len(lines)
        for idx in range(start, len(lines)):
            up = lines[idx].upper()
            if any(up.startswith(h) for h in end_headings):
                end = idx
                break
        return lines[start:end]

    month_year = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}"

    # Extract experience (entry-header + bullet block parsing)
    experience = []
    exp_lines = section_slice("EXPERIENCE", ["PROJECTS", "TECHNICAL SKILLS", "SKILLS", "EDUCATION"])
    header_re = re.compile(
        rf"^(?P<role>Intern|Software Developer|Data Science Intern|DevOps Intern|Developer|Engineer|Analyst|Manager|Specialist|Consultant|Lead)\s+at\s+(?P<company>.+?)\s+(?P<duration>{month_year}\s*[-–]\s*{month_year})$",
        re.IGNORECASE,
    )
    location_re = re.compile(r"([A-Za-z]+,\s*[A-Za-z]+)$")

    current_exp = None
    for raw in exp_lines:
        ln = raw.strip()
        if not ln:
            continue

        header_match = header_re.match(ln)
        if header_match:
            if current_exp:
                experience.append(current_exp)
            current_exp = {
                "company": header_match.group("company").strip(" ,|-"),
                "role": header_match.group("role").strip(),
                "duration": header_match.group("duration").strip(),
                "location": None,
                "responsibilities": [],
            }
            continue

        if not current_exp:
            continue

        # Role/location detail line: "Role - X  Lahore, Punjab"
        if ln.lower().startswith("role"):
            role_text = re.sub(r"^Role\s*[-:]\s*", "", ln, flags=re.IGNORECASE).strip()
            loc_match = location_re.search(role_text)
            if loc_match:
                current_exp["location"] = loc_match.group(1)
                role_text = role_text[:loc_match.start()].strip(" ,|-")
            if role_text:
                current_exp["role"] = role_text
            continue

        # Standalone location line
        if not ln.startswith("•"):
            loc_match = location_re.search(ln)
            if loc_match and not current_exp.get("location"):
                current_exp["location"] = loc_match.group(1)
            continue

        # Bullet responsibilities
        bullet = ln.lstrip("•").strip()
        if bullet:
            current_exp["responsibilities"].append(bullet)

    if current_exp:
        experience.append(current_exp)

    # Cleanup malformed entries
    cleaned_experience = []
    for exp in experience:
        role = (exp.get("role") or "").strip()
        company = (exp.get("company") or "").strip()
        duration = (exp.get("duration") or "").strip()
        location = (exp.get("location") or "").strip() or None
        responsibilities = exp.get("responsibilities") or []

        # Normalize accidental "Role -" prefixes
        role = re.sub(r"^Role\s*[-:]\s*", "", role, flags=re.IGNORECASE).strip()

        # Pull duration out of company if leaked there
        if company and not duration:
            dm = re.search(rf"({month_year}\s*[-–]\s*{month_year})", company, re.IGNORECASE)
            if dm:
                duration = dm.group(1).strip()
                company = company.replace(dm.group(1), "").strip(" ,|-")

        # Drop low-quality ghost entries
        if not company and not duration:
            continue
        if role and role.lower().startswith("role -"):
            role = role[6:].strip()

        cleaned_experience.append({
            "company": company or None,
            "role": role or None,
            "duration": duration or None,
            "location": location,
            "responsibilities": responsibilities,
        })

    experience = cleaned_experience

    # Extract projects (strict section-based parsing)
    projects = []
    project_lines = section_slice("PROJECTS", ["TECHNICAL SKILLS", "SKILLS", "EXPERIENCE", "EDUCATION"])
    current_project = None
    for line in project_lines:
        ln = line.strip()
        if not ln:
            continue

        is_header = (not ln.startswith("•")) and ("|" in ln)
        if is_header:
            if current_project:
                projects.append(current_project)

            left, right = [p.strip() for p in ln.split("|", 1)]
            # remove stray symbols from title (e.g., icon glyphs)
            name = re.sub(r"[^\w\s().+#&/-]", "", left).strip()

            # duration is typically at end of right side
            duration_match = re.search(rf"({month_year})$", right, re.IGNORECASE)
            duration = duration_match.group(1) if duration_match else None
            tech_part = right
            if duration:
                tech_part = re.sub(rf"\s*({month_year})\s*$", "", tech_part, flags=re.IGNORECASE).strip()
            technologies = [t.strip() for t in tech_part.split(",") if t.strip()]

            current_project = {
                "name": name,
                "technologies": technologies,
                "duration": duration,
                "achievements": []
            }
            continue

        if current_project and ln.startswith("•"):
            achievement = ln.lstrip("•").strip()
            if achievement:
                current_project["achievements"].append(achievement)
        elif current_project and current_project["achievements"]:
            # Continuation line for wrapped bullet content
            current_project["achievements"][-1] += " " + ln

    if current_project:
        projects.append(current_project)
    
    # Fallback extraction for resumes with unusual line formatting.
    if not education:
        degree_match = re.search(
            r"(Bachelor(?:\s+of\s+Science)?\s+in\s+[A-Za-z &]+|Master(?:\s+of\s+Science)?\s+in\s+[A-Za-z &]+|PhD(?:\s+in\s+[A-Za-z &]+)?)",
            text,
            re.IGNORECASE,
        )
        years_match = re.search(r"(20\d{2})\s*[–-]\s*(20\d{2})", text)
        institution_match = re.search(
            r"(FAST[^,\n]*|NUCES[^,\n]*|[A-Za-z ]+University[^,\n]*)",
            text,
            re.IGNORECASE,
        )
        if degree_match or institution_match or years_match:
            education.append({
                "institution": institution_match.group(1).strip() if institution_match else None,
                "degree": degree_match.group(1).strip() if degree_match else None,
                "years": years_match.group(0) if years_match else None,
            })

    if not experience:
        role_keywords = r"(Intern|Developer|Engineer|Analyst|Manager|Specialist|Consultant|Lead|Senior|Junior)"
        for line in lines:
            if not re.search(role_keywords, line, re.IGNORECASE):
                continue
            if " at " not in line.lower():
                continue

            role_match = re.search(role_keywords, line, re.IGNORECASE)
            role = role_match.group(1).strip() if role_match else None

            parts = re.split(r"\s+at\s+", line, flags=re.IGNORECASE, maxsplit=1)
            company_part = parts[1].strip() if len(parts) > 1 else None
            duration_match = re.search(
                r"([A-Za-z]+\s+\d{4})\s*[-–]\s*([A-Za-z]+\s+\d{4})",
                line,
            )
            duration = duration_match.group(0) if duration_match else None
            if company_part and duration:
                company_part = company_part.replace(duration, "").strip(" ,|-")

            experience.append({
                "company": company_part,
                "role": role,
                "duration": duration,
                "location": None,
                "responsibilities": [],
            })

    if not projects:
        section_match = re.search(
            r"PROJECTS(.*?)(TECHNICAL SKILLS|SKILLS|$)",
            text,
            re.IGNORECASE | re.DOTALL,
        )
        if section_match:
            project_section = section_match.group(1)
            for raw_line in project_section.split("\n"):
                line = raw_line.strip()
                if not line or line.startswith("•"):
                    continue
                if not re.search(r"(20\d{2})", line):
                    continue
                # Keep likely title lines with separators or known stack keywords.
                if "|" not in line and not any(
                    token in line
                    for token in ["Python", "React", "Node", "Express", "MongoDB", "C#", ".NET", "JavaScript"]
                ):
                    continue

                title = line
                duration = None
                duration_match = re.search(r"\b([A-Za-z]+\s+20\d{2})\b", line)
                if duration_match:
                    duration = duration_match.group(1)
                    title = line[:duration_match.start()].strip(" |-")

                technologies = []
                if "|" in title:
                    left, right = title.split("|", 1)
                    title = left.strip()
                    technologies = [t.strip() for t in right.split(",") if t.strip()]

                projects.append({
                    "name": title,
                    "technologies": technologies,
                    "duration": duration,
                    "achievements": [],
                })

    # Extract skills
    skills = []
    skills_section = False
    skills_keywords = [
        "python", "javascript", "java", "react", "node", "sql", "mongodb",
        "aws", "docker", "kubernetes", "git", "html", "css", "typescript",
        "angular", "vue", "django", "flask", "express", "spring", "c++", "c#",
        "machine learning", "ai", "data science", "tensorflow", "pytorch",
        "opencv", "ocr", "php", "mysql", "mssql", ".net", "streamlit"
    ]
    text_lower = text.lower()
    
    for skill in skills_keywords:
        if skill in text_lower:
            # Capitalize properly
            if skill == "c++":
                skills.append("C++")
            elif skill == "c#":
                skills.append("C#")
            elif skill == "ai":
                skills.append("AI")
            elif " " in skill:
                skills.append(" ".join(word.capitalize() for word in skill.split()))
            else:
                skills.append(skill.capitalize())
    
    # Remove duplicates while preserving order
    seen = set()
    unique_skills = []
    for skill in skills:
        if skill.lower() not in seen:
            seen.add(skill.lower())
            unique_skills.append(skill)
    
    # Remove duplicate experiences
    seen_experiences = set()
    unique_experiences = []
    for exp in experience:
        # Create a unique key based on company, role, and duration
        exp_key = f"{exp.get('company', '')}|{exp.get('role', '')}|{exp.get('duration', '')}"
        if exp_key not in seen_experiences:
            seen_experiences.add(exp_key)
            unique_experiences.append(exp)
    
    # Remove duplicate projects
    seen_projects = set()
    unique_projects = []
    for proj in projects:
        # Create a unique key based on name and duration
        proj_key = f"{proj.get('name', '')}|{proj.get('duration', '')}"
        if proj_key not in seen_projects:
            seen_projects.add(proj_key)
            unique_projects.append(proj)
    
    return {
        "name": name,
        "contact": contact,
        "education": education,
        "experience": unique_experiences,
        "projects": unique_projects,
        "skills": unique_skills
    }


def read_file_from_request():
    """Read file from either multipart/form-data or JSON base64."""
    if request.content_type and "multipart/form-data" in request.content_type:
        f = request.files.get("resume") or request.files.get("file")
        if not f:
            return None, None, "No file provided in multipart upload"
        return f.read(), f.filename or "resume.pdf", None
    
    # JSON with base64
    data = request.get_json(force=True, silent=True) or {}
    b64 = data.get("documentBase64")
    filename = data.get("fileName", "resume.pdf")
    if not b64 or not isinstance(b64, str):
        return None, None, "documentBase64 is required and must be a base64-encoded string"
    
    # Strip optional data URI prefix if provided
    if "," in b64 and ";base64" in b64:
        b64 = b64.split(",", 1)[1]
    
    try:
        decoded = base64.b64decode(b64.strip(), validate=True)
        return decoded, filename, None
    except (binascii.Error, ValueError) as err:
        return None, None, "Invalid base64 encoding for documentBase64"


@app.route("/parse", methods=["POST"])
def parse_single():
    """Parse a single resume file."""
    file_bytes, filename, err_msg = read_file_from_request()
    
    if not file_bytes:
        return jsonify({"success": False, "message": err_msg or "No file provided"}), 400

    filename_lower = (filename or "").lower().strip()
    is_pdf = filename_lower.endswith(".pdf") or file_bytes.startswith(b"%PDF")
    is_docx = filename_lower.endswith(".docx") or file_bytes.startswith(b"PK\x03\x04")

    if not is_pdf and not is_docx:
        return jsonify({
            "success": False,
            "message": "Unsupported file format. Only PDF (.pdf) and Word (.docx) documents are accepted."
        }), 400

    suffix = ".pdf" if is_pdf else ".docx"
    tmp_path = None
    try:
        # Write to temp file safely
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        # Fast path first (pypdf/python-docx), fallback to unstructured if needed.
        text = extract_text_fast(tmp_path, is_pdf)
        if not text or len(text.strip()) < 50:
            text = extract_text_fallback_unstructured(tmp_path, is_pdf)

        # Extract structured fields
        parsed = extract_fields(text)
        
        return jsonify({"success": True, "data": parsed}), 200
    except Exception as e:
        clean_msg = re.sub(r"/tmp/[^\s]+", "[temp_file]", str(e))
        return jsonify({"success": False, "message": f"Resume parsing failed: {clean_msg}"}), 500
    finally:
        # Clean up temp file deterministically
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


@app.route("/parse-batch", methods=["POST"])
def parse_batch():
    """Parse multiple resume files (batch processing)."""
    return jsonify({"success": False, "message": "Batch parsing not yet implemented"}), 501


@app.route("/health", methods=["GET"])
@app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "healthy", "service": "ai-service"}), 200


@app.errorhandler(413)
def request_entity_too_large(error):
    return jsonify({
        "success": False,
        "message": "Uploaded file exceeds the maximum allowed size limit of 10MB."
    }), 413


@app.errorhandler(404)
def not_found(error):
    return jsonify({
        "success": False,
        "message": "The requested endpoint was not found on this service."
    }), 404


@app.errorhandler(500)
def internal_server_error(error):
    return jsonify({
        "success": False,
        "message": "An internal server error occurred within the AI parsing service."
    }), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8001)