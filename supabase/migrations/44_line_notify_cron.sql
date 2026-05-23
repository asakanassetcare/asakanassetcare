-- LINE notification cron jobs
-- วันที่ 1 เวลา 08:00 BKK = 01:00 UTC → ส่งใบแจ้งหนี้
-- วันที่ 5 เวลา 08:00 BKK = 01:00 UTC → ส่งแจ้งเตือน
--
-- แทนที่ค่าด้านล่างก่อนรัน:
--   <PROJECT_REF>  = Supabase project reference (เช่น abcdefghijklmnop)
--   <ANON_KEY>     = Project API key (anon/public) จาก Project Settings → API

select cron.schedule(
  'line_notify_invoice_1st',
  '0 1 1 * *',
  $$
    select net.http_post(
      url     := 'https://qpofehctnesewbgugqvd.supabase.co/functions/v1/line-notify',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwb2ZlaGN0bmVzZXdiZ3VncXZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MzQ4MDEsImV4cCI6MjA5NDUxMDgwMX0.ZAs093RFlWvNNHguGMLxAq6tDTYTeEaye_SyBO1PP7U"}'::text,
      body    := '{"type":"invoice"}'::text
    );
  $$
);

select cron.schedule(
  'line_notify_reminder_5th',
  '0 1 5 * *',
  $$
    select net.http_post(
      url     := 'https://qpofehctnesewbgugqvd.supabase.co/functions/v1/line-notify',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwb2ZlaGN0bmVzZXdiZ3VncXZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MzQ4MDEsImV4cCI6MjA5NDUxMDgwMX0.ZAs093RFlWvNNHguGMLxAq6tDTYTeEaye_SyBO1PP7U"}'::text,
      body    := '{"type":"reminder"}'::text
    );
  $$
);
