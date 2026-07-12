-- Creates private, service-only storage for feedback received from the studio.
CREATE TABLE IF NOT EXISTS public.feedback_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('bug', 'suggestion', 'report')),
  priority text NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 160),
  description text NOT NULL CHECK (char_length(description) BETWEEN 10 AND 5000),
  page_path text,
  image_object_path text,
  image_content_type text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'feedback-widget',
  updated_by text NOT NULL DEFAULT 'feedback-widget'
);

CREATE INDEX IF NOT EXISTS ix_feedback_reports_priority_created
  ON public.feedback_reports(priority, created_at DESC);

ALTER TABLE public.feedback_reports ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT ON TABLE public.feedback_reports TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('feedback-attachments', 'feedback-attachments', false, 6291456, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
