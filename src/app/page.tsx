"use client";

import { useState, useRef, useEffect } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

export default function Home() {
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    const load = async () => {
      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
      if (!ffmpegRef.current) {
        ffmpegRef.current = new FFmpeg();
      }
      const ffmpeg = ffmpegRef.current;

      ffmpeg.on("log", ({ message }) => {
        console.log(message);
      });

      ffmpeg.on("progress", ({ progress }) => {
        setProgress(Math.min(100, Math.round(progress * 100)));
      });

      try {
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });
        setLoaded(true);
      } catch (err) {
        console.error("Failed to load ffmpeg", err);
        setError("Failed to initialize conversion engine. Please refresh.");
      }
    };

    load();
  }, []);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setImage(file);
      setVideoUrl(null);
      setError(null);
    }
  };

  const convertToVideo = async () => {
    if (!image || !loaded) return;

    setLoading(true);
    setProgress(0);
    setError(null);
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg) return;

    // Use fixed filenames to avoid FS issues with special characters
    const inputExt = image.name.split('.').pop()?.toLowerCase() || 'png';
    const inputPath = `input.${inputExt}`;
    const outputPath = "output.mp4";

    try {
      // Cleanup previous video URL to free memory
      if (videoUrl) URL.revokeObjectURL(videoUrl);

      const fileData = await fetchFile(image);
      await ffmpeg.writeFile(inputPath, fileData);

      // Using H.264 (Standard) with -y to overwrite output if exists
      // Forcing -f image2 for and other static-like formats to handle APNG as static
      const isGif = inputExt === 'gif';
      const args = [
        "-y",
        ...(isGif ? [] : ["-f", "image2"]),
        "-loop", "1",
        "-i", inputPath,
        "-t", "1",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-vf", "scale='trunc(iw/2)*2:trunc(ih/2)*2'",
        outputPath
      ];

      await ffmpeg.exec(args);

      const data = await ffmpeg.readFile(outputPath);
      const url = URL.createObjectURL(new Blob([(data as any).buffer], { type: "video/mp4" }));
      setVideoUrl(url);

      // Cleanup files from virtual FS to save WASM memory
      try {
        await ffmpeg.deleteFile(inputPath);
        await ffmpeg.deleteFile(outputPath);
      } catch (e) {
        // Silently fail cleanup if files don't exist
      }
    } catch (err) {
      console.error("Conversion failed", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(`Conversion failed (${errMsg}). Please try again with a different image.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app-container">
      <div className="main-card glass shadow-2xl">
        {/* Background glow */}
        <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.1)_0,transparent_50%)] pointer-events-none"></div>

        <header className="mb-12 text-center relative z-10">
          <h1 className="text-5xl font-extrabold mb-4 title-gradient tracking-tight">
            Moviefy
          </h1>
          <p className="text-text-muted text-lg">
            Convert any image to a 1-second H.264 video.
          </p>
        </header>

        <section className="space-y-8 relative z-10">
          <div className="upload-section">
            <label className="upload-label group">
              <input type="file" accept="image/*" onChange={handleUpload} />

              {previewUrl ? (
                <div className="thumbnail-container">
                  <img src={previewUrl} alt="Thumbnail" className="thumbnail-img" />
                  <p className="file-name">{image?.name}</p>
                  <div className="thumbnail-overlay">
                    <p className="text-white font-medium text-sm">Click to change</p>
                  </div>
                </div>
              ) : (
                <div className="flex-center">
                  <div className="icon-container group-hover:scale-110 transition-transform">
                    <svg className="w-8 h-8 text-primary" style={{ width: '32px', height: '32px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.587-1.587a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-text-muted font-medium">Drag & drop or <span className="text-primary">browse</span></p>
                </div>
              )}
            </label>
          </div>

          <div className="flex-center">
            {!videoUrl ? (
              <button
                disabled={!image || !loaded || loading}
                onClick={convertToVideo}
                className="primary-btn transform active:scale-95 transition-all"
              >
                {loading ? `Processing... ${progress}%` : loaded ? "Create Video" : "Loading Engine..."}
              </button>
            ) : (
              <div className="result-area animate-fade-in">
                <div className="video-container">
                  <video src={videoUrl} controls autoPlay loop className="video-element" />
                </div>
                <div className="btn-group">
                  <button
                    onClick={() => {
                      if (previewUrl) URL.revokeObjectURL(previewUrl);
                      setPreviewUrl(null);
                      setImage(null);
                      setVideoUrl(null);
                    }}
                    className="secondary-btn"
                  >
                    <span>New Project</span>
                  </button>
                  <a
                    href={videoUrl}
                    download={image ? (image.name.substring(0, image.name.lastIndexOf('.')) || image.name) + ".mp4" : "moviefy-video.mp4"}
                    className="download-link"
                  >
                    <span>Download</span>
                    <svg className="icon-sm" style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </a>
                </div>
              </div>
            )}

            {error && (
              <div className="w-full p-4 bg-accent/10 border border-accent/20 rounded-2xl flex items-center gap-3 animate-shake">
                <svg className="w-5 h-5 text-accent shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-accent text-sm font-medium">{error}</p>
              </div>
            )}
          </div>
        </section>

        <footer className="mt-12 pt-8 border-t border-glass-border text-center relative z-10">
          <p className="text-text-muted text-xs flex items-center justify-center gap-2">
            <svg className="icon-sm" style={{ width: '16px', height: '16px', minWidth: '16px' }} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M2.166 4.999c0-1.657 1.343-3 3-3h9.668c1.657 0 3 1.343 3 3v10.001c0 1.657-1.343 3-3 3H5.166c-1.657 0-3-1.343-3-3V4.999zm3-1c-.552 0-1 .448-1 1v10.001c0 .552.448 1 1 1h9.668c.553 0 1-.448 1-1V4.999c0-.552-.447-1-1-1H5.166zM10 8a2 2 0 100-4 2 2 0 000 4zm2 5a2 2 0 11-4 0 2 2 0 014 0z" clipRule="evenodd" />
            </svg>
            <span>Privacy Policy: Your images and videos are processed client-side and never stored on our servers.</span>
          </p>
        </footer>
      </div>
    </main>
  );
}

