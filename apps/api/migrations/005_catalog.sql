CREATE TABLE app.books (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  collel_id uuid NOT NULL REFERENCES app.collels(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 300),
  author text NOT NULL DEFAULT '' CHECK (length(author) <= 200),
  subject text NOT NULL DEFAULT '' CHECK (length(subject) <= 120),
  cabinet text NOT NULL DEFAULT '' CHECK (length(cabinet) <= 60),
  shelf text NOT NULL DEFAULT '' CHECK (length(shelf) <= 60),
  position text NOT NULL DEFAULT '' CHECK (length(position) <= 100),
  search_text text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (collel_id, id),
  UNIQUE (collel_id, title, author, subject, cabinet, shelf, position)
);
CREATE INDEX books_classification_idx ON app.books (collel_id, subject, title, id);
CREATE INDEX books_location_idx ON app.books (collel_id, cabinet, shelf, position, id);
ALTER TABLE app.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.books FORCE ROW LEVEL SECURITY;
CREATE POLICY books_read ON app.books FOR SELECT TO catalog_app
  USING (collel_id = nullif(current_setting('app.collel_id', true), '')::uuid AND app.has_access(collel_id));
CREATE POLICY books_create ON app.books FOR INSERT TO catalog_app
  WITH CHECK (collel_id = nullif(current_setting('app.collel_id', true), '')::uuid AND app.has_access(collel_id, 'admin'));
CREATE POLICY books_edit ON app.books FOR UPDATE TO catalog_app
  USING (collel_id = nullif(current_setting('app.collel_id', true), '')::uuid AND app.has_access(collel_id, 'admin'))
  WITH CHECK (collel_id = nullif(current_setting('app.collel_id', true), '')::uuid AND app.has_access(collel_id, 'admin'));
CREATE POLICY books_delete ON app.books FOR DELETE TO catalog_app
  USING (collel_id = nullif(current_setting('app.collel_id', true), '')::uuid AND app.has_access(collel_id, 'admin'));
DO $$ BEGIN
  EXECUTE format('CREATE POLICY books_maintenance ON app.books TO %I USING (true) WITH CHECK (true)', current_user);
END $$;
REVOKE ALL ON app.books FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.books TO catalog_app;
