-- Add preview as blob for JSON storage (will fail silently if column exists)
ALTER TABLE `data_components` ADD `preview` blob;