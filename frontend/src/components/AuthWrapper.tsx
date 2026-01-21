'use client';

import React, { useEffect } from 'react';
import { useSession, signOut, signIn } from 'next-auth/react';
import { Button } from './ui/button';
import { LogOut, User, RefreshCw } from 'lucide-react';

interface AuthWrapperProps {
  children: React.ReactNode;
}

export default function AuthWrapper({ children }: AuthWrapperProps) {
  const { data: session, status, update } = useSession();

  // Enhanced session validation
  const isValidSession = session && 
    session.user && 
    status === 'authenticated';

  // Handle session errors and refresh
  useEffect(() => {
    if (status === 'unauthenticated') {
      // Session expired, force re-authentication
      signIn();
    }
  }, [status]);

  // Handle loading state with better messaging
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  // Handle invalid session
  if (!isValidSession || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-6 max-w-md">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              AI Attendance System
            </h1>
            <p className="text-lg text-gray-600">
              Please sign in to access the system
            </p>
          </div>

          <div className="space-y-4">
            <Button 
              size="lg" 
              className="w-full"
              onClick={() => signIn()}
            >
              <User className="w-5 h-5 mr-2" />
              Sign In
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="w-full"
              onClick={() => window.location.href = '/auth/register'}
            >
              Create Account
            </Button>
          </div>

          {status === 'unauthenticated' && (
            <div className="text-sm text-red-600">
              Session expired. Please sign in again.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Navigation Bar */}
      <nav className="bg-white shadow-sm border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">
                AI Attendance System
              </h1>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* User Info */}
              <div className="flex items-center space-x-3 bg-gray-50 px-3 py-2 rounded-lg">
                <div className="flex items-center space-x-2">
                  <User className="w-5 h-5 text-gray-500" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-700">
                      {session.user?.name || session.user?.email}
                    </p>
                    <p className="text-xs text-gray-500">
                      {session.user?.email}
                    </p>
                  </div>
                </div>
              </div>

              {/* Session Refresh Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => update()}
                className="flex items-center space-x-2"
                title="Refresh session"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>

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
