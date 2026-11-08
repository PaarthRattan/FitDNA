-- Demo listings for local development, loaded by `supabase db reset` (config.toml →
-- [db.seed]). Never pushed to a hosted project: `db push` applies migrations only.
--
-- Demo listings are visible to everyone, signed in or not, so search and the fit map
-- have something to show before any real link is imported. Their URLs are on a
-- reserved domain (.invalid) and the app never links out to them. Safe to run again.

insert into public.listings
  (id, marketplace, canonical_url, title, price, currency, size_label, condition, seller_rating, is_demo, fetched_at)
values
  ('d0000000-0000-4000-8000-000000000001', 'grailed', 'https://demo.fitdna.invalid/grailed-wool-zip-cardigan',
   'Wool zip cardigan · size 3 · used, excellent', 185, 'USD', '3', 'excellent', 4.9, true, now()),
  ('d0000000-0000-4000-8000-000000000002', 'ebay', 'https://demo.fitdna.invalid/ebay-older-season-cardigan',
   'Similar cut, older season cardigan · size M', 120, 'USD', 'M', 'good', 4.6, true, now()),
  ('d0000000-0000-4000-8000-000000000003', 'poshmark', 'https://demo.fitdna.invalid/poshmark-cropped-denim-jacket',
   'Cropped denim jacket · size L', 96, 'USD', 'L', 'like_new', 4.8, true, now()),
  ('d0000000-0000-4000-8000-000000000004', 'depop', 'https://demo.fitdna.invalid/depop-boxy-heavyweight-tee',
   'Boxy heavyweight tee · size M', 38, 'USD', 'M', 'good', 4.7, true, now())
on conflict (canonical_url) do nothing;

-- The seller's measurements, as the regex extractor would have read them. The eBay
-- listing has none on purpose: it shows the size-label estimate.
insert into public.listing_extractions (listing_id, source, fields, confidence, extractor_version)
values
  ('d0000000-0000-4000-8000-000000000001', 'seller', '{
     "measurements": {
       "chest": {"cm": 55.9, "basis": "flat", "unit": "in", "span": "Pit to pit: 22\"", "assumed": []},
       "shoulder": {"cm": 44.5, "unit": "in", "span": "Shoulder: 17.5\"", "assumed": []},
       "length": {"cm": 68.6, "unit": "in", "span": "Length: 27\"", "assumed": []},
       "sleeve": {"cm": 63.5, "unit": "in", "span": "Sleeve: 25\"", "assumed": []}
     },
     "conflicting": [], "category": "knit", "sizeLabel": "3", "condition": "excellent"
   }', 1, 'regex-1'),
  ('d0000000-0000-4000-8000-000000000002', 'seller', '{
     "measurements": {}, "conflicting": [], "category": "knit", "sizeLabel": "M", "condition": "good"
   }', 0, 'regex-1'),
  ('d0000000-0000-4000-8000-000000000003', 'seller', '{
     "measurements": {
       "chest": {"cm": 60, "basis": "flat", "unit": "cm", "span": "Armpit to armpit 60 cm", "assumed": []},
       "shoulder": {"cm": 49, "unit": "cm", "span": "Shoulders 49 cm", "assumed": []},
       "length": {"cm": 58, "unit": "cm", "span": "Length 58 cm", "assumed": []}
     },
     "conflicting": [], "category": "jacket", "sizeLabel": "L", "condition": "like_new"
   }', 1, 'regex-1'),
  ('d0000000-0000-4000-8000-000000000004', 'seller', '{
     "measurements": {
       "chest": {"cm": 58.4, "basis": "flat", "unit": "in", "span": "p2p 23\"", "assumed": []},
       "length": {"cm": 71.1, "unit": "in", "span": "Length 28\"", "assumed": []},
       "sleeve": {"cm": 22.9, "unit": "in", "span": "Sleeve 9\"", "assumed": []}
     },
     "conflicting": [], "category": "tee", "sizeLabel": "M", "condition": "good"
   }', 1, 'regex-1')
on conflict (listing_id, source) do nothing;
