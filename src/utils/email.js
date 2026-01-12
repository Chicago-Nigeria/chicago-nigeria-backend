const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');

const resend = new Resend(process.env.RESEND_API_KEY);

// Load and compile email template
const loadTemplate = (templateName) => {
  const templatePath = path.join(__dirname, '..', 'templates', `${templateName}.hbs`);
  const templateSource = fs.readFileSync(templatePath, 'utf-8');
  return Handlebars.compile(templateSource);
};

const sendOTPEmail = async (email, otp, options = {}) => {
  try {
    const { firstName, isSignup = false } = options;

    // Compile template with data
    const template = loadTemplate('otp-email');
    const html = template({
      otp,
      firstName,
      isSignup,
      expiryMinutes: process.env.OTP_EXPIRY_MINUTES || 10,
      year: new Date().getFullYear(),
    });

    // Send email via Resend
    const data = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Chicago Nigeria <no-reply@admin.chicagonigerians.com>',
      to: email,
      subject: isSignup
        ? 'Welcome to Chicago Nigeria - Verify Your Email'
        : 'Your Chicago Nigeria Verification Code',
      html,
    });

    console.log('Email sent successfully:', data.id);
    return data;
  } catch (error) {
    console.error('Email send error:', error);
    throw new Error('Failed to send OTP email');
  }
};

module.exports = { sendOTPEmail };
