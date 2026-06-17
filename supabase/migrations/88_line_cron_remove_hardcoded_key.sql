-- Replace hardcoded anon key in LINE notify cron jobs with settings table lookup
-- Same pattern: store sensitive config in settings table, not in SQL code
-- Run once to seed: INSERT INTO settings(key,value) VALUES ('anon_key', '"<anon_key>"');

select cron.unschedule('line_notify_invoice_1st');
select cron.unschedule('line_notify_reminder_5th');
select cron.unschedule('line_notify_contract_expiry_30d');
select cron.unschedule('line_notify_contract_expiry_7d');

select cron.schedule(
  'line_notify_invoice_1st',
  '0 1 1 * *',
  $$
    select net.http_post(
      url     := 'https://qpofehctnesewbgugqvd.supabase.co/functions/v1/line-notify',
      headers := json_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT value #>> '{}' FROM settings WHERE key = 'anon_key')
      )::text,
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
      headers := json_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT value #>> '{}' FROM settings WHERE key = 'anon_key')
      )::text,
      body    := '{"type":"reminder"}'::text
    );
  $$
);

select cron.schedule(
  'line_notify_contract_expiry_30d',
  '0 1 * * *',
  $$
    select net.http_post(
      url     := 'https://qpofehctnesewbgugqvd.supabase.co/functions/v1/line-notify',
      headers := json_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT value #>> '{}' FROM settings WHERE key = 'anon_key')
      )::text,
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
      headers := json_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT value #>> '{}' FROM settings WHERE key = 'anon_key')
      )::text,
      body    := '{"type":"contract_expiry","days_before":7}'::text
    );
  $$
);
