import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell, PublicShell, RedirectIfAuthed, RequireActive } from "./components/Layout";
import { LoadingState } from "./components/ui";
import { AuthProvider } from "./lib/auth";
import Landing from "./pages/Landing";
import AuthCallback from "./pages/auth/AuthCallback";
import CompleteProfile from "./pages/auth/CompleteProfile";
import ConfirmEmail from "./pages/auth/ConfirmEmail";
import CheckEmail from "./pages/auth/CheckEmail";
import ForgotPassword from "./pages/auth/ForgotPassword";
import Login from "./pages/auth/Login";
import ResetPassword from "./pages/auth/ResetPassword";
import Signup from "./pages/auth/Signup";
import { Blocked, NotFound, Pending } from "./pages/errors/ErrorPages";
import Scans from "./pages/app/Scans";
import ScanDetail from "./pages/app/ScanDetail";
import History from "./pages/app/History";
import Notifications from "./pages/app/Notifications";
import Profile, { PublicProfile } from "./pages/app/Profile";
import Settings from "./pages/app/Settings";

const Admin = lazy(() => import("./pages/admin/Admin"));

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<div className="fullscreen"><LoadingState /></div>}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route element={<PublicShell />}>
              <Route element={<RedirectIfAuthed />}>
                <Route path="/signup" element={<Signup />} />
                <Route path="/login" element={<Login />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/check-email" element={<CheckEmail />} />
              </Route>
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/complete-profile" element={<CompleteProfile />} />
              <Route path="/confirm-email" element={<ConfirmEmail />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/pending" element={<Pending />} />
              <Route path="/blocked" element={<Blocked />} />
            </Route>
            <Route element={<RequireActive />}>
              <Route element={<AppShell />}>
                <Route path="/app" element={<Scans />} />
                <Route path="/app/scans/:id" element={<ScanDetail />} />
                <Route path="/history" element={<History />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/u/:nickname" element={<PublicProfile />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/admin" element={<Admin />} />
              </Route>
            </Route>
            <Route element={<PublicShell />}>
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
