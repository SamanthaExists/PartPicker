import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, MapPin, Package, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useGlobalSearch, type SearchResult } from '@/hooks/useGlobalSearch';
import { usePartClassifications } from '@/hooks/usePartClassifications';
import { ClassificationBadge } from '@/components/parts/ClassificationBadge';

interface GlobalSearchProps {
  className?: string;
}

export function GlobalSearch({ className }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false); // For mobile expand/collapse
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { results, loading, search, clearResults } = useGlobalSearch();

  // Fetch part classifications for search results
  const partNumbers = useMemo(() => results.map(r => r.part_number), [results]);
  const { partsMap } = usePartClassifications(partNumbers);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length >= 2) {
        search(query);
        setIsOpen(true);
      } else {
        clearResults();
        setIsOpen(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, search, clearResults]);

  // Handle click outside to close dropdown and collapse on mobile
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        // Collapse on mobile when clicking outside
        if (isExpanded && query.trim() === '') {
          setIsExpanded(false);
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExpanded, query]);

  // Focus input when expanded on mobile
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [results]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleResultClick(results[selectedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        inputRef.current?.blur();
        break;
    }
  };

  const handleGoToOrder = (result: SearchResult) => {
    navigate(`/orders/${result.order_id}`);
    setQuery('');
    setIsOpen(false);
    setIsExpanded(false); // Close mobile search
    clearResults();
  };

  const handleViewInParts = (result: SearchResult) => {
    navigate(`/parts?search=${encodeURIComponent(result.part_number)}`);
    setQuery('');
    setIsOpen(false);
    setIsExpanded(false); // Close mobile search
    clearResults();
  };

  // Keep legacy handler for keyboard navigation (defaults to order view)
  const handleResultClick = (result: SearchResult) => {
    handleGoToOrder(result);
  };

  const handleClear = () => {
    setQuery('');
    setIsOpen(false);
    clearResults();
    inputRef.current?.focus();
  };

  const handleFocus = () => {
    if (query.trim().length >= 2 && results.length > 0) {
      setIsOpen(true);
    }
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Mobile: Icon button that expands to full search */}
      {!isExpanded && (
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden h-9 w-9"
          onClick={() => setIsExpanded(true)}
          aria-label="Search"
        >
          <Search className="h-5 w-5" />
        </Button>
      )}

      {/* Mobile expanded search - full screen overlay style */}
      {isExpanded && (
        <div className="fixed inset-x-0 top-14 z-50 bg-background border-b shadow-lg p-4 lg:hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              type="text"
              placeholder="Search parts..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={handleFocus}
              className="pl-10 pr-10 h-11 w-full text-base"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9"
              onClick={() => {
                handleClear();
                setIsExpanded(false);
              }}
            >
              <X className="h-5 w-5" />
            </Button>
            {loading && (
              <Loader2 className="absolute right-12 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>
      )}

      {/* Desktop: Always visible input */}
      <div className="relative hidden lg:block">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={!isExpanded ? inputRef : undefined}
          type="text"
          placeholder="Search parts across all orders..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          className="pl-10 pr-10 h-9 w-80"
        />
        {query && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            onClick={handleClear}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        {loading && (
          <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className={cn(
            "bg-background border rounded-md shadow-lg z-50 max-h-96 overflow-y-auto",
            // Mobile: fixed position below the expanded search bar
            isExpanded && "fixed inset-x-0 top-[7.5rem] mx-4 lg:mx-0",
            // Desktop: absolute position below the input
            !isExpanded && "absolute top-full left-0 right-0 mt-1"
          )}
        >
          {results.length === 0 && !loading && query.trim().length >= 2 && (
            <div className="p-4 text-center text-muted-foreground">
              <Package className="mx-auto h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No parts found matching "{query}"</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="py-1">
              <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                {results.length} result{results.length !== 1 ? 's' : ''} found
              </div>
              {results.map((result, index) => {
                const isComplete = result.total_picked >= result.total_qty_needed;
                const remaining = result.total_qty_needed - result.total_picked;

                return (
                  <div
                    key={`${result.id}-${result.order_id}`}
                    className={cn(
                      'w-full px-3 py-2 hover:bg-accent transition-colors',
                      selectedIndex === index && 'bg-accent',
                      isComplete && 'bg-green-50/50 dark:bg-green-950/20'
                    )}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-semibold text-sm">
                            {result.part_number}
                          </span>
                          {(() => {
                            const part = partsMap.get(result.part_number);
                            return part ? <ClassificationBadge classification={part.classification_type} size="sm" /> : null;
                          })()}
                          {result.location && (
                            <Badge variant="outline" className="gap-1 text-xs py-0">
                              <MapPin className="h-3 w-3" />
                              {result.location}
                            </Badge>
                          )}
                        </div>
                        {result.description && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {result.description}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          Order: <span className="font-medium">SO-{result.so_number}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-medium">
                          <span className={cn(isComplete && 'text-green-600 dark:text-green-400')}>
                            {result.total_picked}
                          </span>
                          <span className="text-muted-foreground"> / {result.total_qty_needed}</span>
                        </div>
                        {isComplete ? (
                          <Badge variant="success" className="text-xs mt-0.5">Complete</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {remaining} left
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Navigation buttons */}
                    <div className="flex items-center gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-xs flex-1 sm:flex-none"
                        onClick={() => handleGoToOrder(result)}
                      >
                        Order
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs flex-1 sm:flex-none"
                        onClick={() => handleViewInParts(result)}
                      >
                        Parts
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {query.trim().length >= 2 && results.length > 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground border-t bg-muted/30">
              Press <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Enter</kbd> to select,{' '}
              <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Esc</kbd> to close
            </div>
          )}
        </div>
      )}
    </div>
  );
}
