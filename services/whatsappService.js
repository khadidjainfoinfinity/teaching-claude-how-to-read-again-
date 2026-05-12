import twilio from 'twilio';

// Converts Algerian local format (05/06/07XXXXXXXX) → whatsapp:+2136XXXXXXXX
const toWhatsApp = (phone) => `whatsapp:+213${phone.substring(1)}`;

export const sendOtpWhatsApp = async (phone, otp) => {
  const client = twilio(
    process.env.TWILIO_SID,
    process.env.TWILIO_AUTH_TOKEN,
  );

  await client.messages.create({
    from:             'whatsapp:+14155238886',
    contentSid:       'HX229f5a04fd0510ce1b071852155d3e75',
    contentVariables: JSON.stringify({ '1': otp }),
    to:               toWhatsApp(phone),
  });
};
