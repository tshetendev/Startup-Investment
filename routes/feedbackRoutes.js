const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
// const Feedback = require('../model/feedbackModel'); // Assuming feedback model is defined


const feedbackSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    subject: {
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


const transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false, // true for port 465, false for other ports
    auth: {
        user: "tshetendev@gmail.com",
        pass: "Tsheten@2003",
    },
});


// Route to create feedback
router.post('/feedback', async (req, res) => {

    const { message, rating, subject, email, name } = req.body;


    try {
        // Create a new feedback object
        const newFeedback = new Feedback({
            name,
            email,
            subject,
            message,
            rating,
            createdAt: new Date()
        });

        // Save the feedback to the database
        await newFeedback.save();

        // Send success response
        res.status(201).json({
            message: 'Feedback submitted successfully',
            feedback: newFeedback
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

// Route to get feedback
router.get('/feedback', async (req, res) => {
    try {

        // Check if user is a creator
        // if (req.session.user.userType !== 'admin') {
        //     return res.status(403).json({ error: 'Only Admin has access to feedbacks!' });
        // }

        // Fetch all feedback entries
        const feedback = await Feedback.find();

        if (feedback.length === 0) {
            return res.status(404).send('No feedback found');
        }

        // Send feedback as JSON response
        res.json(feedback);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/send-email', (req, res) => {
    const { name, email, message } = req.body;

    let mailOptions = {
        from: email, // sender address
        to: 'tshetendev@gmail.com', // list of receivers
        subject: `New message from ${name}`, // Subject line
        text: message, // plain text body
        html: `<p>You have a new message from <strong>${name}</strong> (${email}):</p><p>${message}</p>`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error occurred: ', error); // Log the error to the console
            return res.status(500).json({ message: 'Error sending email', error: error.message });
        }
        res.status(200).json({ message: 'Message sent successfully!' });
    });
});

module.exports = router;
