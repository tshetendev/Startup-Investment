const mongoose = require('mongoose');

// Define user schema
const userSchema = new mongoose.Schema({
    name: { type: String },
    email: { type: String, unique: true },
    password: String,
    walletAddress: { type: String, unique: false},
    // walletSecret: { type: String },
    userType: { 
        type: String, 
        enum: ['admin', 'creator', 'investor'],
        default: "investor"
    },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    profilePicture: { type: String },

});

const User = mongoose.model('User', userSchema);

module.exports = User;
