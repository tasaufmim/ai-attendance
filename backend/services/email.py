import smtplib
import secrets
import string
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from typing import Optional
import os
from jinja2 import Template
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class EmailService:
    def __init__(self):
        self.smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_username = os.getenv("SMTP_USERNAME")
        self.smtp_password = os.getenv("SMTP_PASSWORD")
        self.from_email = os.getenv("FROM_EMAIL", self.smtp_username)
        
        # Don't raise error if SMTP credentials aren't configured
        # Email functionality will be disabled
        if not all([self.smtp_username, self.smtp_password]):
            print("⚠️  Warning: SMTP credentials not configured. Email functionality disabled.")
            self.email_enabled = False
        else:
            self.email_enabled = True

    def generate_token(self, length: int = 32) -> str:
        """Generate a secure random token"""
        alphabet = string.ascii_letters + string.digits
        return ''.join(secrets.choice(alphabet) for _ in range(length))

    def create_verification_email(self, email: str, token: str) -> MIMEMultipart:
        """Create email verification message"""
        msg = MIMEMultipart()
        msg['From'] = self.from_email
        msg['To'] = email
        msg['Subject'] = "Verify Your Email Address"
        
        # Email template
        template = """
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Email Verification</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #007bff; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background: #f8f9fa; }
                .button { display: inline-block; padding: 12px 24px; background: #28a745; color: white; text-decoration: none; border-radius: 4px; }
                .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>AI Attendance System</h1>
                </div>
                <div class="content">
                    <h2>Welcome to AI Attendance System!</h2>
                    <p>Thank you for registering. To complete your account setup, please verify your email address by clicking the button below:</p>
                    <p style="text-align: center;">
                        <a href="{{ verify_url }}" class="button">Verify Email Address</a>
                    </p>
                    <p>Or copy and paste this link into your browser:</p>
                    <p><a href="{{ verify_url }}">{{ verify_url }}</a></p>
                    <p><strong>This link will expire in 24 hours.</strong></p>
                </div>
                <div class="footer">
                    <p>If you didn't create an account with us, please ignore this email.</p>
                    <p>&copy; 2024 AI Attendance System. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        verify_url = f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/verify-email?token={token}"
        
        html_content = Template(template).render(verify_url=verify_url)
        msg.attach(MIMEText(html_content, 'html'))
        
        return msg

    def create_password_reset_email(self, email: str, token: str) -> MIMEMultipart:
        """Create password reset email message"""
        msg = MIMEMultipart()
        msg['From'] = self.from_email
        msg['To'] = email
        msg['Subject'] = "Reset Your Password"
        
        # Email template
        template = """
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Password Reset</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #dc3545; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background: #f8f9fa; }
                .button { display: inline-block; padding: 12px 24px; background: #dc3545; color: white; text-decoration: none; border-radius: 4px; }
                .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>AI Attendance System</h1>
                </div>
                <div class="content">
                    <h2>Password Reset Request</h2>
                    <p>We received a request to reset your password. If you made this request, click the button below to reset your password:</p>
                    <p style="text-align: center;">
                        <a href="{{ reset_url }}" class="button">Reset Password</a>
                    </p>
                    <p>Or copy and paste this link into your browser:</p>
                    <p><a href="{{ reset_url }}">{{ reset_url }}</a></p>
                    <p><strong>This link will expire in 1 hour.</strong></p>
                    <p>If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</p>
                </div>
                <div class="footer">
                    <p>&copy; 2024 AI Attendance System. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        reset_url = f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/reset-password?token={token}"
        
        html_content = Template(template).render(reset_url=reset_url)
        msg.attach(MIMEText(html_content, 'html'))
        
        return msg

    async def send_email(self, to_email: str, message: MIMEMultipart) -> bool:
        """Send email using SMTP"""
        if not self.email_enabled:
            print("Email not configured - skipping email send")
            return False
            
        try:
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_username, self.smtp_password)
                server.send_message(message)
            return True
        except Exception as e:
            print(f"Failed to send email: {e}")
            return False

    async def send_verification_email(self, email: str, token: str) -> bool:
        """Send email verification email"""
        message = self.create_verification_email(email, token)
        return await self.send_email(email, message)

    async def send_password_reset_email(self, email: str, token: str) -> bool:
        """Send password reset email"""
        message = self.create_password_reset_email(email, token)
        return await self.send_email(email, message)

# Global email service instance
email_service = EmailService()
