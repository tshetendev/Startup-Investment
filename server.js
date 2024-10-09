const express = require('express');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const User = require("./model/userModel")
const config = require('./public/js/config');

require('dotenv').config();
const xrpl = require('xrpl');
const session = require('express-session');
const path = require('path');

const app = express();

// Serve static files from the uploads folder
app.use('/uploads', express.static('uploads'));

// Load Routes
const userRoutes = require('./routes/userRoutes');
const projectRoutes = require('./routes/projectRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public/Admin Dashboard')));

// Session configuration
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false
}));

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // Add this line

// Use Routes
app.use(userRoutes);
app.use(projectRoutes);
app.use(feedbackRoutes);

// Middleware to check if the user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        next();
    } else {
        res.send('<script>alert("Unauthorized access. Please log in!"); window.location.href = "/";</script>');
    }
};

app.get('/home', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'homepage.html'));
});

app.get('/ttt', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mytransaction.html'));
});

app.get('/pp', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'uploadProfile.html'));
});

// Routes
// app.get('/home', (req, res) => {
//     res.sendFile(path.join(__dirname, 'public', 'homepage.html'));
// });

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'Admin Dashboard', 'index.html'));
});

// app.get('/admin',isAuthenticated, (req, res) => {
//     res.sendFile(path.join(__dirname, 'public', 'Admin Dashboard', 'index.html'));
// });

app.get('/chome', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'creatorPage.html'));
});

// Initialize XRPL API with the server
const api = new xrpl.Client('wss://s.altnet.rippletest.net:51233', {
    connectionTimeout: 10000
});

// Connect to XRPL
api.connect().then(() => {
    console.log('Connected to XRPL');
}).catch((error) => {
    console.error('Failed to connect to XRPL:', error);
});

// Connect to MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('Failed to connect to MongoDB:', err));


// resetpassword

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.emailUser,
      pass: config.emailPass,
    },
    
  });

  app.post('/reset', async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });
  
    if (!user) {
        return res.status(404).json({ message: 'No account with that email address exists.' });
    }

    const token = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    const mailOptions = {
        to: user.email,
        from: config.emailUser,
        subject: 'Password Reset',
        text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n
               Please click on the following link, or paste this into your browser to complete the process:\n\n
               http://${req.headers.host}/reset/${token}\n\n
               If you did not request this, please ignore this email and your password will remain unchanged.\n`,
    };

    transporter.sendMail(mailOptions, (err, response) => {
        if (err) {
            console.error('There was an error: ', err);
            return res.status(500).json({ message: 'Failed to send recovery email.' });
        } else {
            res.redirect("/")
        }
    });
});

app.get('/reset/:token', async (req, res) => {
const user = await User.findOne({
  resetPasswordToken: req.params.token,
  resetPasswordExpires: { $gt: Date.now() },
});

if (!user) {
  return res.send('Password reset token is invalid or has expired.');
}

res.sendFile(__dirname + '/public/reset.html');
});

app.post('/reset/:token', async (req, res) => {
const user = await User.findOne({
  resetPasswordToken: req.params.token,
  resetPasswordExpires: { $gt: Date.now() },
});

if (!user) {
  return res.send('Password reset token is invalid or has expired.');
}

if (req.body.password === req.body.confirm) {
    try {
        // Hash the new password
        const hashedPassword = await bcrypt.hash(req.body.password, 10);

        // Update user's password and clear reset token and expiration
        user.password = hashedPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        
        // Save the user object
        await user.save();
        
        res.send('Password has been reset.');
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
} else {
    res.send('Passwords do not match.');
}
});




// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
