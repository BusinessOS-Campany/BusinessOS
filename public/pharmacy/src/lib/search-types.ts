export type SearchGroup = {
  title: string;
  hrefPrefix: string;
  items: Array<{ id: string; label: string; sub?: string }>;
};