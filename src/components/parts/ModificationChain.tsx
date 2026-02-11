import { useState, useEffect } from 'react';
import { ArrowRight, Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useParts } from '@/hooks/useParts';
import type { ModificationChainItem } from '@/types';
import { cn } from '@/lib/utils';

interface ModificationChainProps {
  partId: string;
}

export function ModificationChain({ partId }: ModificationChainProps) {
  const { getModificationChain } = useParts();
  const [chain, setChain] = useState<ModificationChainItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadChain();
  }, [partId]);

  async function loadChain() {
    setLoading(true);
    const data = await getModificationChain(partId);
    setChain(data);
    setLoading(false);
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">Loading modification history...</p>
        </CardContent>
      </Card>
    );
  }

  if (chain.length <= 1) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Modification History</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Visual Timeline */}
          <div className="flex items-center gap-2 flex-wrap">
            {chain.map((item, idx) => (
              <div key={item.part.id} className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex items-center gap-2 p-2 border rounded',
                    item.part.id === partId && 'ring-2 ring-primary bg-accent'
                  )}
                >
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="font-mono font-medium text-sm">
                      {item.part.part_number}
                    </div>
                    {item.level === 0 && (
                      <Badge
                        variant="outline"
                        className="mt-1 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                      >
                        Original
                      </Badge>
                    )}
                    {item.level > 0 && (
                      <Badge
                        variant="outline"
                        className="mt-1 text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                      >
                        v{item.level}
                      </Badge>
                    )}
                  </div>
                </div>
                {idx < chain.length - 1 && (
                  <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                )}
              </div>
            ))}
          </div>

          {/* Detailed List */}
          <div className="space-y-2">
            {chain.map((item) => (
              <div
                key={item.part.id}
                className={cn(
                  'p-3 border rounded',
                  item.part.id === partId && 'ring-2 ring-primary bg-accent'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">{item.part.part_number}</span>
                        {item.level === 0 ? (
                          <Badge
                            variant="outline"
                            className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                          >
                            Original
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                          >
                            Modified v{item.level}
                          </Badge>
                        )}
                        {item.part.id === partId && (
                          <Badge variant="default">Current</Badge>
                        )}
                      </div>
                      {item.part.description && (
                        <div className="text-sm text-muted-foreground mt-1">
                          {item.part.description}
                        </div>
                      )}
                    </div>
                  </div>
                  {item.part.default_location && (
                    <div className="text-sm text-muted-foreground">
                      📍 {item.part.default_location}
                    </div>
                  )}
                </div>
                {item.part.notes && (
                  <div className="text-xs text-muted-foreground mt-2 pl-7">
                    Note: {item.part.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
