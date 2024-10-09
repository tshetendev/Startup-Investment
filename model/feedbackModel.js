const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Define the schema for the feedback model
const feedbackSchema = new Schema({
    email: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Create and export the Feedback model
const Feedback = mongoose.model('Feedback', feedbackSchema);
module.exports = Feedback;
