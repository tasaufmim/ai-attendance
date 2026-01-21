'use client';

import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';

interface AuthWrapperProps {
  children: React.ReactNode;
}

export default function AuthWrapper({ children }: AuthWrapperProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-6">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              AI Attendance System
            </h1>
            <p className="text-lg text-gray-600">
              Please sign in to access the system
            </p>
          </div>
          
          <div className="space-y-4">
            <Button size="lg" className="w-full max-w-sm">
              <a href="/auth/login">Sign In</a>
            </Button>
            <Button size="lg" variant="outline" className="w-full max-w-sm">
              <a href="/auth/register">Create Account</a>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
