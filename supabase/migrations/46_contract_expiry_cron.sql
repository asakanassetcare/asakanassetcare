-- แจ้งเตือนสัญญาใกล้หมด ทุกวัน 08:00 BKK = 01:00 UTC
-- ส่ง 30 วันก่อนหมด และ 7 วันก่อนหมด

select cron.schedule(
  'line_notify_contract_expiry_30d',
  '0 1 * * *',
  $$
    select net.http_post(
      url     := 'https://qpofehctnesewbgugqvd.supabase.co/functions/v1/line-notify',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwb2ZlaGN0bmVzZXdiZ3VncXZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MzQ4MDEsImV4cCI6MjA5NDUxMDgwMX0.ZAs093RFlWvNNHguGMLxAq6tDTYTeEaye_SyBO1PP7U"}'::text,
      body    := '{"type":"contract_expiry","days_before":30}'::text
    );
  $$
);

select cron.schedule(
  'line_notify_contract_expiry_7d',
  '0 1 * * *',
  $$
    select net.http_post(
      url     := 'https://qpofehctnesewbgugqvd.supabase.co/functions/v1/line-notify',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwb2ZlaGN0bmVzZXdiZ3VncXZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MzQ4MDEsImV4cCI6MjA5NDUxMDgwMX0.ZAs093RFlWvNNHguGMLxAq6tDTYTeEaye_SyBO1PP7U"}'::text,
      body    := '{"type":"contract_expiry","days_before":7}'::text
    );
  $$
);
