import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPublicContent, getAdminContent, updateContent } from '@/api/content';
import type { SiteContent, HeaderContent, FooterContent, AboutContent } from '@/api/content';

// ─── Public hook (for header, footer, about page) ────────────────────────────

export function useSiteContent() {
  return useQuery({
    queryKey: ['site-content', 'public'],
    queryFn: getPublicContent,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// ─── Admin hook (for the content editor) ─────────────────────────────────────

export function useAdminContent() {
  return useQuery({
    queryKey: ['site-content', 'admin'],
    queryFn: getAdminContent,
    staleTime: 0,
  });
}

export function useUpdateContent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: keyof SiteContent; value: HeaderContent | FooterContent | AboutContent }) =>
      updateContent(key, value),
    onSuccess: () => {
      // Invalidate both public and admin caches
      queryClient.invalidateQueries({ queryKey: ['site-content'] });
    },
  });
}
