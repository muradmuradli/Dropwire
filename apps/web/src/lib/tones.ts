export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'primary';

export const toneClass: Record<Tone, string> = {
  success: 'bg-success/12 text-success border-success/30',
  warning: 'bg-warning/12 text-warning border-warning/30',
  danger: 'bg-destructive/12 text-destructive border-destructive/30',
  info: 'bg-info/12 text-info border-info/30',
  muted: 'bg-muted text-muted-foreground border-border',
  primary: 'bg-primary/15 text-primary border-primary/30',
};
