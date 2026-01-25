import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { AuthGate } from "@/components/auth/AuthGate";

// Pages
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Processing from "./pages/Processing";
import Studio from "./pages/Studio";
import Export from "./pages/Export";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import Profile from "./pages/Profile";
import AuthCallback from "./pages/AuthCallback";
import Watch from "./pages/Watch";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Navigate to="/login" replace />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            
            {/* Phase 1: Processing can be done without login (great UX!) */}
            <Route path="/processing" element={<Processing />} />

            {/* Unique video URL: /v/:videoId — fetch from Supabase, player only. Auth required. */}
            <Route
              path="/v/:videoId"
              element={
                <AuthGate
                  title="Sign in to watch this video"
                  message="Sign in to watch this video. Each video is private to your account."
                  featureName="Watch"
                >
                  <Watch />
                </AuthGate>
              }
            />

            {/* Protected routes - require authentication */}
            <Route 
              path="/dashboard" 
              element={
                <AuthGate 
                  title="Welcome to GitFlick" 
                  message="Sign in to access your dashboard and manage your video projects."
                  featureName="Dashboard"
                >
                  <Dashboard />
                </AuthGate>
              } 
            />
            <Route 
              path="/studio" 
              element={
                <AuthGate 
                  title="Almost there!" 
                  message="Sign in to access the Studio and edit your generated video."
                  featureName="Studio"
                >
                  <Studio />
                </AuthGate>
              } 
            />
            <Route 
              path="/export" 
              element={
                <AuthGate 
                  title="Export Your Video" 
                  message="Sign in to export and download your video."
                  featureName="Export"
                >
                  <Export />
                </AuthGate>
              } 
            />
            <Route 
              path="/profile" 
              element={
                <AuthGate 
                  title="Your Profile" 
                  message="Sign in to view and manage your profile."
                  featureName="Profile"
                >
                  <Profile />
                </AuthGate>
              } 
            />
            
            {/* Catch-all route */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
