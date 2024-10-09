const User = require('../model/userModel');
const bcrypt = require('bcrypt');
const express = require('express');
const router = express.Router();
const { Wallet } = require('xrpl');
const multer = require('multer');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // specify the folder to save uploaded files
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname); // create a unique filename
    }
});

const upload = multer({
    storage: storage
});

// Route to update profile picture
router.put('/profile-picture', isAuthenticated, upload.single('profilePicture'), async (req, res) => {
    try {
        // Get the user's email from the session
        const email = req.session.user.email;

        // Find the user in the database
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).send('User not found');
        }

        // Check if a file was uploaded
        if (!req.file) {
            return res.status(400).send('Please upload a profile picture');
        }

        // Update the user's profile picture path
        user.profilePicture = req.file.path;

        // Save the updated user to the database
        await user.save();

        // Send success response
        res.status(200).send('Profile picture updated successfully');
    } catch (error) {
        console.error('Error updating profile picture:', error);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/user-stats', async (req, res) => {
    try {
        // Count total number of users
        const totalUsers = await User.countDocuments();

        // Count number of users with userType 'creator'
        const totalCreators = await User.countDocuments({ userType: 'creator' });

        // Count number of users with userType 'investor'
        const totalInvestors = await User.countDocuments({ userType: 'investor' });

        res.status(200).json({
            totalUsers,
            totalCreators,
            totalInvestors
        });
    } catch (error) {
        console.error('Error retrieving user stats:', error);
        res.status(500).json({ error: 'Error retrieving user stats' });
    }
});
// Route for user registration
router.post('/register', async (req, res) => {
    const { name, email, password, confirmPassword, walletAddress, walletSecret, userType } = req.body;

    try {
        // Check if password and confirmPassword are empty
        if (!password || !confirmPassword) {
            return res.status(400).send('Please provide both password and confirm password');
        }

        // Check if a user with the provided email already exists
        let existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).send('User with this email already exists');
        }

        // Check if password and confirmPassword match
        if (password !== confirmPassword) {
            return res.status(400).send('Password and confirm password do not match');
        }

        // Validate the wallet address
        console.log('Wallet Address:', walletAddress); // Log for debugging
        if (!isValidRippleAddress(walletAddress)) {
            console.log('Invalid Wallet Address:', walletAddress);
            return res.status(400).send('Invalid Ripple wallet address. Please ensure the address starts with "r" and is between 25 and 35 characters.');
        }


        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create a new user
        const newUser = new User({
            name,
            email,
            walletAddress,
            password: hashedPassword,
            userType
        });

        // Save the user to the database
        await newUser.save();
        console.log('New User: ', newUser);

        // Send success response
        res.status(201).send('User registered successfully');
    } catch (error) {
        // If an error occurs during registration, send an error response
        console.error(error);
        res.status(500).send('An error occurred during registration. Please try again later.');
    }
});


// Route for user registration
// router.post('/register', async (req, res) => {
//     const { name, email, password, confirmPassword, walletAddress, walletSecret, userType } = req.body;

//     try {
//         // Check if password and confirmPassword are empty
//         if (!password || !confirmPassword) {
//             return res.status(400).send('Please provide both password and confirm password');
//         }

//         // Check if a user with the provided email already exists
//         let existingUser = await User.findOne({ email });
//         if (existingUser) {
//             return res.status(400).send('User with this email already exists');
//         }

//         // Check if a user with the provided wallet address already exists
//         // existingUser = await User.findOne({ walletAddress });
//         // if (existingUser) {
//         //     return res.status(400).send('User with this wallet address already exists');
//         // }

//         // Check if password and confirmPassword match
//         if (password !== confirmPassword) {
//             return res.status(400).send('Password and confirm password do not match');
//         }

//         // Validate the wallet address
//         if (!isValidRippleAddress(walletAddress)) {
//             return res.status(400).send('Invalid Ripple wallet address');
//         }

//         // Validate the wallet secret
//         // const isValidSecretForAddress = await validateWalletSecret(walletAddress, walletSecret);
//         // if (!isValidSecretForAddress) {
//         //     return res.status(400).send('Invalid wallet secret for the provided wallet address');
//         // }

//         // Hash the password
//         const hashedPassword = await bcrypt.hash(password, 10);

//         // Hash wallet secret
//         const hashedWalletSecret = await bcrypt.hash(walletSecret, 10);

//         // Create a new user
//         const newUser = new User({
//             name,
//             email,
//             walletAddress,
//             // walletSecret: hashedWalletSecret,
//             password: hashedPassword,
//             userType
//         });

//         // Save the user to the database
//         await newUser.save();
//         console.log('New User: ', newUser);

//         // Send success response
//         res.status(201).send('User registered successfully');
//     } catch (error) {
//         // If an error occurs during registration, send an error response
//         console.error(error);
//         res.status(500).send('An error occurred during registration. Please try again later.');
//     }
// });

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Find the user by email
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(400).send('Invalid email or password');
        }

        // Compare passwords
        const passwordMatch = await bcrypt.compare(password, user.password); // Await the result of bcrypt.compare
        if (!passwordMatch) {
            return res.status(400).send('Invalid email or password');
        }

        // Store user details in session
        req.session.user = {
            id: user._id,
            name: user.name,
            email: user.email,
            walletAddress: user.walletAddress,
            userType: user.userType // Include userType in the session data
        };

        // Send user type in the response along with a success message
        res.json({ message: 'Login successful', userType: user.userType });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/logout', (req, res) => {
    try {
        // Destroy the session
        req.session.destroy((err) => {
            if (err) {
                console.error('Error destroying session:', err);
                res.status(500).send('Internal Server Error');
            } else {
                res.clearCookie('session'); // Clear the session cookie
                res.status(200).send('Logout successful');
            }
        });
    } catch (error) {
        console.error('Error logging out:', error);
        res.status(500).send('Internal Server Error');
    }
});


// Route for fetching all users
router.get('/users/all', async (req, res) => {
    try {
        const users = await User.find();
        if (users.length === 0) {
            return res.status(404).send('No users found');
        }
        res.json(users);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

// Function to validate XRP wallet address
function isValidRippleAddress(address) {
    const rippleAddressRegex = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/i;
    return rippleAddressRegex.test(address);
}


// Function to validate if the provided wallet secret corresponds to the given wallet address
async function validateWalletSecret(walletAddress, walletSecret) {
    try {
        // Create a new wallet object from the provided secret
        const wallet = Wallet.fromSeed(walletSecret);

        // Get the address corresponding to the provided secret
        const secretAddress = wallet.address;

        // Compare the provided address and the address derived from the secret
        return secretAddress === walletAddress;
    } catch (error) {
        console.error(error);
        return false;
    }
}

function isAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    } else {
        res.status(401).send('You need to log in to view this page');
    }
}

// Route to get the profile information of the logged-in user
router.get('/profile', isAuthenticated, async (req, res) => {
    try {
        // Get the user's email from the session
        const email = req.session.user.email;

        // Find the user in the database
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).send('User not found');
        }

        // Remove sensitive information like password and wallet secret before sending the response
        const userProfile = {
            name: user.name,
            email: user.email,
            walletAddress: user.walletAddress,
            userType: user.userType,
            profilePicture: user.profilePicture
        };

        // Send the user's profile information
        res.status(200).json(userProfile);
    } catch (error) {
        console.error('Error retrieving user profile:', error);
        res.status(500).send('Internal Server Error');
    }
});


router.put('/profile', isAuthenticated, async (req, res) => {
    const { name, email, currentPassword } = req.body;

    try {
        // Get the user's email from the session
        const sessionEmail = req.session.user.email;

        // Find the user in the database
        const user = await User.findOne({ email: sessionEmail });

        if (!user) {
            return res.status(404).send('User not found');
        }

        // Validate current password
        const passwordMatch = await bcrypt.compare(currentPassword, user.password);
        if (!passwordMatch) {
            return res.status(400).send('Current password is incorrect');
        }

        // Update the user's profile information
        if (name) user.name = name;
        if (email) user.email = email;

        // Save the updated user to the database
        await user.save();

        // Update session information if email was changed
        if (email) {
            req.session.user.email = email;
        }

        // Send success response
        res.status(200).send('Profile updated successfully');
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).send('Internal Server Error');
    }
});



// Route to update profile picture
router.put('/profile-picture', isAuthenticated, upload.single('profilePicture'), async (req, res) => {
    try {
        // Get the user's email from the session
        const email = req.session.user.email;

        // Find the user in the database
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).send('User not found');
        }

        // Check if a file was uploaded
        if (!req.file) {
            return res.status(400).send('Please upload a profile picture');
        }

        // Update the user's profile picture path
        user.profilePicture = req.file.path;

        // Save the updated user to the database
        await user.save();

        // Send success response
        res.status(200).send('Profile picture updated successfully');
    } catch (error) {
        console.error('Error updating profile picture:', error);
        res.status(500).send('Internal Server Error');
    }
});


module.exports = router;