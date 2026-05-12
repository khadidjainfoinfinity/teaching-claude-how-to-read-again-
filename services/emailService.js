import nodemailer from 'nodemailer';

export const sendOtpEmail = async (to, otp) => {
  // Transporter created here (not at module level) so dotenv vars are already loaded
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from:    `"NovaShop" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'NovaShop – Password Reset OTP',
    html:    `<h2>Your OTP code: <strong>${otp}</strong></h2>
              <p>Valid for 5 minutes. Do not share it.</p>`,
  });
};
