-- Webshop (B2B rendelőoldal) — 1/2: 'customer' szerep a user_role enumhoz.
-- KÜLÖN migráció: a Postgres nem engedi az ADD VALUE-t és annak felhasználását
-- ugyanabban a tranzakcióban, ezért a séma-migráció (2/2) külön fut utána.
alter type public.user_role add value if not exists 'customer';
