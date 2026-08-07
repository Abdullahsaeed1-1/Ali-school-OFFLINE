import { Outlet } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-luxury-radial px-6 py-10 text-text md:px-10 lg:px-16">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-7xl items-center justify-center">
        <div className="w-full max-w-6xl overflow-hidden rounded-[2rem] border border-border bg-surface/60 shadow-luxe backdrop-blur-glass">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
