import { api } from './client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HeaderContent {
  siteName: string;
}

export interface FooterContent {
  tagline: string;
  subtext: string;
}

export interface AboutContent {
  title: string;
  paragraphs: string[];
  features: string[];
  accessibilityNote: string;
}

export interface SiteContent {
  header?: HeaderContent;
  footer?: FooterContent;
  about?: AboutContent;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getPublicContent(): Promise<SiteContent> {
  const { data } = await api.get('/public/content');
  return data.content ?? {};
}

// ─── Admin API ────────────────────────────────────────────────────────────────

export async function getAdminContent(): Promise<SiteContent> {
  const { data } = await api.get('/admin/content');
  return data.content ?? {};
}

export async function updateContent(key: keyof SiteContent, value: HeaderContent | FooterContent | AboutContent): Promise<void> {
  await api.put(`/admin/content/${key}`, value);
}
