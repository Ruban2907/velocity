require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');
const { connectToMongoDb } = require('./config/connect');

const port = process.env.PORT || 3000;

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is not defined");
}

let server = null;
let isShuttingDown = false;

const gracefulShutdown = async (signal, exitCode = 0) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\nReceived ${signal}. Initiating graceful shutdown...`);

  // Bounded fallback force shutdown after 10 seconds
  const forceExitTimer = setTimeout(() => {
    console.error('Graceful shutdown timed out after 10s. Forcing process exit.');
    process.exit(1);
  }, 10000);
  forceExitTimer.unref();

  try {
    if (server) {
      console.log('Closing HTTP server and waiting for in-flight requests to complete...');
      try {
        await new Promise((resolve, reject) => {
          server.close((err) => {
            if (err) return reject(err);
            resolve();
          });
        });
        console.log('HTTP server closed.');
      } catch (serverErr) {
        console.error('Error closing HTTP server:', serverErr.message);
        exitCode = 1;
      }
    }

    if (mongoose.connection && mongoose.connection.readyState !== 0) {
      console.log('Closing MongoDB connection...');
      try {
        await mongoose.connection.close(false);
        console.log('MongoDB connection closed.');
      } catch (dbErr) {
        console.error('Error closing MongoDB connection:', dbErr.message);
        exitCode = 1;
      }
    }

    clearTimeout(forceExitTimer);
    console.log('Graceful shutdown completed.');
    process.exit(exitCode);
  } catch (err) {
    console.error('Unexpected error during graceful shutdown:', err.message);
    process.exit(1);
  }
};

// Handle process termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM', 0));
process.on('SIGINT', () => gracefulShutdown('SIGINT', 0));

// Catch unhandled errors safely without dumping secrets
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.name || 'Error', err.message || 'Unknown error');
  gracefulShutdown('uncaughtException', 1);
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error('Unhandled Promise Rejection:', msg);
  gracefulShutdown('unhandledRejection', 1);
});


connectToMongoDb(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB successfully');
    server = app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  });