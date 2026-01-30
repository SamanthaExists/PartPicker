import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  Package,
  ShoppingCart,
  Upload,
  Settings,
  Menu,
  X,
  Wifi,
  WifiOff,
  AlertTriangle,
  History,
  User,
  Check,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { GlobalSearch } from '@/components/layout/GlobalSearch';
import { useOnlineStatus } from '@/hooks/useOffline';
import { useSettings } from '@/hooks/useSettings';
import { InstallButton } from '@/components/pwa/InstallPrompt';

interface MainLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/orders', label: 'Orders', icon: ClipboardList },
  { path: '/parts', label: 'Parts', icon: Package },
  { path: '/items-to-order', label: 'Items to Order', icon: ShoppingCart },
  { path: '/issues', label: 'Issues', icon: AlertTriangle },
  { path: '/activity', label: 'Activity History', icon: History },
  { path: '/import', label: 'Import', icon: Upload },
  { path: '/settings', label: 'Settings', icon: Settings },
];

function OnlineStatusBadge({ className }: { className?: string }) {
  const isOnline = useOnlineStatus();

  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium',
        isOnline
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        className
      )}
    >
      {isOnline ? (
        <>
          <Wifi className="h-3 w-3" />
          <span className="hidden sm:inline">Online</span>
        </>
      ) : (
        <>
          <WifiOff className="h-3 w-3" />
          <span className="hidden sm:inline">Offline</span>
        </>
      )}
    </div>
  );
}

function UserBadge({ className }: { className?: string }) {
  const { settings, updateSettings } = useSettings();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');

  if (!settings.user_name) return null;

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setNewName(settings.user_name);
    }
  };

  const handleSave = () => {
    if (newName.trim()) {
      updateSettings({ user_name: newName.trim() });
      setOpen(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer',
            className
          )}
          title="Click to change user"
        >
          <User className="h-3 w-3" />
          <span className="max-w-[100px] truncate">{settings.user_name}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="change-name" className="text-sm font-medium">
              Change User
            </Label>
            <p className="text-xs text-muted-foreground">
              Enter your name to track your picks
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              id="change-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter your name"
              autoFocus
            />
            <Button size="sm" onClick={handleSave} disabled={!newName.trim()}>
              <Check className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function MainLayout({ children }: MainLayoutProps) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header */}
      <header className="sticky top-0 z-40 flex h-14 items-center border-b bg-background px-4 lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
        <h1 className="ml-3 text-lg font-semibold flex-1 truncate">Tool Pick List</h1>
        <UserBadge className="mr-2" />
        <OnlineStatusBadge className="mr-2" />
        <GlobalSearch />
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 w-64 transform border-r bg-background transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 flex flex-col',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className="flex h-14 items-center justify-between border-b px-6">
            <Link to="/" className="flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold">Pick List Tracker</span>
            </Link>
          </div>

          <nav className="flex-1 space-y-1 p-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Install button at bottom of sidebar */}
          <div className="border-t p-4">
            <InstallButton />
          </div>
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content area with desktop header */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Desktop header with global search */}
          <header className="sticky top-0 z-30 hidden lg:flex h-14 items-center justify-end gap-4 border-b bg-background px-6 shrink-0">
            <UserBadge />
            <OnlineStatusBadge />
            <GlobalSearch />
          </header>

          {/* Main content */}
          <main className="flex-1 overflow-auto">
            <div className="container mx-auto p-4 lg:p-6">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
