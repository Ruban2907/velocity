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
const { trackActivity } = require('./middleware/activityMiddleware');
const { authenticate } = require('./middleware/auth');

const app = express();
const port = process.env.PORT || 3000;

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:8081',
  'http://localhost:8080',
  'http://localhost:3000',
].filter(Boolean);

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

    if (allowedOrigins.indexOf(origin) !== -1 || isLocalhostOrigin || isPrivateNetworkOrigin) {
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

connectToMongoDb(process.env.MONGODB_URI || "mongodb://localhost:27017/Velocity")
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

// Admin Routes
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Velocity API is running' });
});
app.post("/", (req, res) => {
    res.send("POST request received");
  });
  
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});