-- CollabBoard Initial Migration
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- ============================================
-- TABLES
-- ============================================

-- Boards
CREATE TABLE IF NOT EXISTS boards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Untitled Board',
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Board Objects (sticky notes, shapes, frames, connectors, text)
CREATE TABLE IF NOT EXISTS board_objects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('sticky_note', 'rectangle', 'circle', 'line', 'frame', 'connector', 'text')),
  x FLOAT NOT NULL DEFAULT 0,
  y FLOAT NOT NULL DEFAULT 0,
  width FLOAT DEFAULT 150,
  height FLOAT DEFAULT 150,
  rotation FLOAT DEFAULT 0,
  z_index INTEGER DEFAULT 0,
  properties JSONB DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_board_objects_board_id ON board_objects(board_id);
CREATE INDEX IF NOT EXISTS idx_boards_created_by ON boards(created_by);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_objects ENABLE ROW LEVEL SECURITY;

-- Boards policies
CREATE POLICY "Authenticated users can read boards"
  ON boards FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can create boards"
  ON boards FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Board creators can update their boards"
  ON boards FOR UPDATE TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Board creators can delete their boards"
  ON boards FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

-- Board objects policies (permissive for collaboration)
CREATE POLICY "Authenticated users can read board objects"
  ON board_objects FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create board objects"
  ON board_objects FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update board objects"
  ON board_objects FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete board objects"
  ON board_objects FOR DELETE TO authenticated USING (true);

-- ============================================
-- REALTIME
-- ============================================

-- Enable realtime for board_objects (this is what powers live sync)
ALTER PUBLICATION supabase_realtime ADD TABLE board_objects;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER board_objects_updated_at
  BEFORE UPDATE ON board_objects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();