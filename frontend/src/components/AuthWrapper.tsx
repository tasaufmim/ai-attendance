'use client';

import React from 'react';
import { useSession, signOut } from 'next-auth/react';
import { Button } from './ui/button';
import { LogOut, User } from 'lucide-react';

interface AuthWrapperProps {
  children: React.ReactNode;
}

export default function AuthWrapper({ children }: AuthWrapperProps) {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
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

  return (
    <>
      {/* Navigation Bar */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">
                AI Attendance System
              </h1>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* User Info */}
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <User className="w-5 h-5 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">
                    {session.user?.name || session.user?.email}
                  </span>
                </div>
              </div>

              {/* Logout Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => signOut({ callbackUrl: '/' })}
                className="flex items-center space-x-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main>
        {children}
      </main>
    </>
  );
}
