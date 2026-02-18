const { sendContactEmail } = require('../utils/email');

const submitContactForm = async (req, res) => {
    try {
        const { fullName, email, subject, inquiryType, message, phone } = req.body;

        // Basic validation
        if (!fullName || !email || !subject || !inquiryType || !message) {
            return res.status(400).json({ status: 'error', message: 'All required fields must be provided' });
        }

        // Send email
        await sendContactEmail({
            fullName,
            email,
            phone,
            subject,
            inquiryType,
            message,
        });

        res.status(200).json({ status: 'success', message: 'Message sent successfully' });
    } catch (error) {
        console.error('Submit contact form error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to send message' });
    }
};

module.exports = {
    submitContactForm,
};
