-- Run once with the hosting provider's maintenance account. Set a unique random
-- password with the provider's console or psql's \password catalog_app command.
-- No application account is a member of the object-owner role.
CREATE ROLE catalog_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
