// In your Passport configuration file (e.g., config/passport-setup.js)
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User"); // <<< ADJUST PATH TO YOUR USER MODEL

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,       // From .env
    clientSecret: process.env.GOOGLE_CLIENT_SECRET, // From .env
    callbackURL: "/auth/google/callback"      // Must match Google Cloud Console
  },
  async (accessToken, refreshToken, profile, done) => {
    const googleEmail = profile.emails ? profile.emails[0].value : null;
  
    if (!googleEmail) {
      // You might want to pass a more specific error message to done here
      return done(new Error("Google profile did not provide an email address."), false);
    }

    try {
      // 1. Try to find the user based on their Google ID
      let user = await User.findOne({ googleId: profile.id });

      if (user) {
        // Existing Google-linked user found, log them in
        return done(null, user);
      }

      // 2. User not found by Google ID. Check if their email is already registered.
      user = await User.findOne({ email: googleEmail });
      if (user) {
        // Email is found in the database, but not linked to this Google ID.
        // This means the email was likely registered via password or another method.
        // Inform the user that the email is already registered and they should log in differently.
        return done(null, false, { message: "This email address is already registered with an account. Please log in using your password, or if you wish to link this Google account, please do so via your account settings." });
      } else {
        // 3. No user found by Google ID or by email - this is a brand new user.
        
        const newUser = new User({
          googleId: profile.id,
          email: googleEmail,
          first_name: profile.name ? profile.name.givenName : "",
          last_name: profile.name ? profile.name.familyName : "",
          googleProfilePicture: profile.photos ? profile.photos[0].value : null,
          role: "user" // Default role for new users
          // Ensure all required fields from your User schema are populated here or have defaults
        });

        await newUser.save(); // Save the new user to the database
        return done(null, newUser); // Return the newly created user
      }
    } catch (err) {
      console.error("!!! ERROR in Google Verify Callback !!!");
      console.error("Error Name:", err.name);
      console.error("Error Message:", err.message);
      if (err.errors) {
        console.error("Validation Errors:", JSON.stringify(err.errors, null, 2));
      }
      console.error("Error Stack:", err.stack);
      return done(err, false);
    }
  }
));

// If not using sessions (session: false in passport.authenticate), serializeUser/deserializeUser are not strictly needed for this flow.
// passport.serializeUser((user, done) => done(null, user.id));
// passport.deserializeUser(async (id, done) => {
//   try {
//     const user = await User.findById(id);
//     done(null, user);
//   } catch (err) {
//     done(err, null);
//   }
// });
