const express = require("express");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const router = express.Router();
const passport = require("passport");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { testModel } = require('../features/model/user.model');
require("dotenv").config();


router.get("/github", async (req, res) => {
  const code = req.query.code;
  const accessToken = await fetch(`https://github.com/login/oauth/access_token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code: code
    })
  }).then((res) => res.json())

  const user = await fetch(`https://api.github.com/user`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken.access_token}`
    }
  })
    .then((res) => res.json());
  console.log(user);
  res.send("Authentication successfull");
})

// GOOGLE OAUTH

router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["email", "profile"] })
);
router.get(
  "/auth/google/callback",
  passport.authenticate('google', {
    successRedirect: '/auth/google/success',
    failureRedirect: '/google/failure',
    session: false

  })
);
router.get('/auth/google/success', (req, res) => {
  res.send("home page")
})

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "https://talkies-authentication-server-1.onrender.com/auth/google/callback",
  passReqToCallback: true,
},
async function (request, accessToken, refreshToken, profile, done) {
  let email = profile._json.email;
  let name = profile._json.name;
  const user = new testModel({ email, name });
  await user.save();
  return done(null, user);
  //   console.log(profile);
}
  )

);


module.exports = router;


