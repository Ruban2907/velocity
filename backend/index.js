require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { connectToMongoDb } = require('./config/connect');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const resumeRoutes = require('./routes/resumeRoutes');
const recruitmentRoutes = require('./routes/recruitmentRoutes');
const assessmentRoutes = require('./routes/assessmentRoutes');
const emailTemplateRoutes = require('./routes/emailTemplateRoutes');
const adminRoutes = require('./routes/adminRoutes');
const jobRoutes = require('./routes/jobRoutes');
const candidateRoutes = require('./routes/candidateRoutes');
const { trackActivity } = require('./middleware/activityMiddleware');
const { authenticate } = require('./middleware/auth');

const app = express();
const port = process.env.PORT || 3000;

const allowedOrigins = [];
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(...process.env.FRONTEND_URL.split(',').map(url => url.trim()));
}
allowedOrigins.push(
  'http://localhost:5173',
  'http://localhost:8081',
  'http://localhost:8080',
  'http://localhost:3000'
);

const isDevelopment = process.env.NODE_ENV !== 'production';

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (isDevelopment) return callback(null, true);

    let isLocalhostOrigin = false;
    let isPrivateNetworkOrigin = false;
    try {
      const parsedOrigin = new URL(origin);
      isLocalhostOrigin = ['localhost', '127.0.0.1'].includes(parsedOrigin.hostname);
      isPrivateNetworkOrigin = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(parsedOrigin.hostname);
    } catch (error) {
      isLocalhostOrigin = false;
      isPrivateNetworkOrigin = false;
    }

    const uniqueOrigins = [...new Set(allowedOrigins.filter(Boolean))];

    if (uniqueOrigins.indexOf(origin) !== -1 || isLocalhostOrigin || isPrivateNetworkOrigin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(cookieParser());
app.use(trackActivity);

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is not defined");
}

connectToMongoDb(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB successfully');
  })
  .catch((error) => {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  });

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/recruitment', recruitmentRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/email-templates', emailTemplateRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/candidates', candidateRoutes);

// Admin Routes
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => {
  res.json({ success: true, message: "Backend running" });
});

app.get('/api/debug-version', (req, res) => {
  res.json({
    version: "candidate-response-normalized-v1",
    time: new Date().toISOString()
  });
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});