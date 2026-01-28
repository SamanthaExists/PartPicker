import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useSettings } from '@/hooks/useSettings';
import { User } from 'lucide-react';

export function NamePrompt() {
  const { settings, loaded, updateSettings } = useSettings();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    // Show the dialog if settings are loaded and no name is set
    if (loaded && !settings.user_name) {
      setOpen(true);
    }
  }, [loaded, settings.user_name]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      updateSettings({ user_name: name.trim() });
      setOpen(false);
    }
  };

  // Don't render anything until settings are loaded
  if (!loaded) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Welcome! What's your name?
          </DialogTitle>
          <DialogDescription>
            Your name will be recorded with any picks or changes you make,
            so the team can see who did what.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Your Name</Label>
              <Input
                id="name"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                autoComplete="name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!name.trim()}>
              Continue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
