// Import your allowed origins list
const allowedOrigins = require("./allowedOrigins"); 

const corsOptions = {
  origin: (origin, callback) => {
    // Log the received origin to the console

    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      // Allow the request
      callback(null, true);
    } else {
      // Block the request
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

module.exports = corsOptions;