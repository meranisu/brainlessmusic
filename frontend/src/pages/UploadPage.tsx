import { useRef, type DragEvent } from 'react';
import { AUDIO_EXTENSIONS, useUploads } from '../components/UploadProvider';
import { UploadQueueList } from '../components/UploadQueueList';

export function UploadPage() {
  const { skipped, addFiles } = useUploads();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-base font-semibold text-white">Upload</h2>
        <p className="mt-0.5 text-sm text-blue-300">
          Files are tagged, filed into the library, and available immediately. Uploads keep going on other pages; the
          Overview tab shows them too.
        </p>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="card flex cursor-pointer flex-col items-center justify-center border-2 border-dashed border-blue-700 px-6 py-16 text-center transition-colors hover:border-orange-600/50 hover:bg-blue-900/60"
      >
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-800 text-xl text-blue-200">
          ↑
        </span>
        <p className="text-sm font-medium text-blue-100">Drop audio files here, or click to browse</p>
        <p className="mt-1 text-xs text-blue-400">{[...AUDIO_EXTENSIONS].join(' ')}</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={[...AUDIO_EXTENSIONS].join(',')}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            // Lets the same file be picked again after a Clear finished.
            e.target.value = '';
          }}
        />
      </div>

      {skipped.length > 0 && (
        <p role="status" className="mt-3 wrap-break-word text-sm text-red-300">
          Skipped {skipped.length === 1 ? '1 file' : `${skipped.length} files`} that {skipped.length === 1 ? "isn't" : "aren't"} audio:{' '}
          {skipped.join(', ')}
        </p>
      )}

      <div className="mt-6">
        <UploadQueueList />
      </div>
    </div>
  );
}
