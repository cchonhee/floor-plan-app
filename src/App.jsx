import React, { useState, useRef, useEffect } from "react";
import {
  Image as ImageIcon,
  Download,
  AlertCircle,
  Loader2,
  Camera,
  UploadCloud,
  Frame,
  Key,
} from "lucide-react";

export default function App() {
  const [imageSrc, setImageSrc] = useState(null);
  const [base64Data, setBase64Data] = useState(null);
  const [imageMimeType, setImageMimeType] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState("");

  const canvasRef = useRef(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("이미지 파일만 업로드 가능합니다.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      setImageSrc(dataUrl);

      const base64 = dataUrl.split(",")[1];
      setBase64Data(base64);
      setImageMimeType(file.type);
      setAnalysisResult(null);
      setError("");
    };
    reader.readAsDataURL(file);
  };

  const analyzeImage = async () => {
    if (!base64Data) {
      setError("도면 이미지를 업로드해주세요.");
      return;
    }

    setIsProcessing(true);
    setError("");

    let finalApiKey = "";

    try {
      if (
        typeof import.meta !== "undefined" &&
        import.meta.env &&
        import.meta.env.VITE_GEMINI_API_KEY
      ) {
        finalApiKey = import.meta.env.VITE_GEMINI_API_KEY;
      }
    } catch (e) {
      console.warn("환경 변수를 불러오지 못했습니다.", e);
    }

    if (!finalApiKey) {
      setError(
        "API 키가 없습니다. 버셀(Vercel) 환경 변수 세팅을 확인해 주세요.",
      );
      setIsProcessing(false);
      return;
    }

    // 💡 [핵심 업데이트] 대표님의 "선이 꺾이는 곳 중앙에서 보조선 추출" 원칙을 프롬프트에 이식했습니다.
    const payload = {
      contents: [
        {
          parts: [
            {
              text: `다음은 건축 평면도 이미지야. 다중 도면이 있다면 모두 독립적으로 분석해.\n\n**[앱의 핵심 목적]**\n각 방(공간)을 둘러싼 벽면의 길이를 측정하고, 치수보조선이 정확히 '굵은 붉은선/마젠타선이 꺾이는 곳(모서리)'에서 시작되도록 좌표를 추출해야 해.\n\n**[공간 식별 및 기점(좌표) 추출 규칙 (매우 중요!)]**\n1. 공간 식별: 굵은 붉은선(마젠타선)으로 감싸여 있고 내부에 얇은 붉은 가로선이 채워진 곳, 혹은 그 내부가 검은색 선으로 구획되어 이름("송백실", "음악실" 등)이 붙은 곳이 하나의 개별 '방'이야.\n2. 치수보조선의 시작점(x1, y1)과 끝점(x2, y2) 추출 원칙:\n   - 반드시 외곽의 '굵은 붉은선 혹은 마젠타선이 꺾이는 곳(코너, 모서리)'을 기점으로 찾아라.\n   - 방을 구획하는 '검은색 선(한 줄, 두 줄, 진한 줄 등)'이 굵은 붉은선과 만나는 교차점도 선이 꺾이거나 나뉘는 곳이므로 동일한 기점으로 취급해라.\n   - 추출하는 좌표 (x, y) 픽셀 위치는 반드시 그 **'굵은 붉은선(혹은 마젠타선, 검은선) 두께의 정가운데(중심)'**에 찍혀야 해.\n\n**[출력 요구사항]**\n식별된 모든 방에 대해 4개의 벽면(상, 하, 좌, 우) 선분(segment) 데이터를 추출해:\n- roomName: 방 이름 (예: "송백실")\n- segments: 방을 둘러싼 4면의 측정 선분 배열\n  - position: 'top', 'bottom', 'left', 'right'\n  - orientation: 'horizontal' (상/하), 'vertical' (좌/우)\n  - text: 길이 수치 (예: "W: 8.0m" 또는 "H: 6.5m")\n  - x1, y1: 측정 선분의 시작점 X, Y 백분율 좌표 (반드시 선이 꺾이는 곳의 두께 중앙 픽셀)\n  - x2, y2: 측정 선분의 끝점 X, Y 백분율 좌표 (반드시 선이 꺾이는 곳의 두께 중앙 픽셀)`,
            },
            {
              inlineData: {
                mimeType: imageMimeType || "image/jpeg",
                data: base64Data,
              },
            },
          ],
        },
      ],
      systemInstruction: {
        parts: [
          {
            text: "너는 건축 CAD 도면 분석가야. 각 방의 이름을 식별하고, 사방 치수선을 그리기 위해 방을 구성하는 선분들을 추출해. 치수선 기점 좌표(x1,y1, x2,y2)는 허공이나 대략적인 위치가 아니라, 반드시 '굵은 붉은선/마젠타선이 꺾이는 곳(모서리)'이나 '검은색 구획선과 만나는 교차점'의 '선 두께의 정가운데 픽셀' 위치를 0~100 백분율로 정확히 반환해야 해. 응답은 JSON(JavaScript Object Notation) 형식이어야 해.",
          },
        ],
      },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            rooms: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  roomName: { type: "STRING" },
                  segments: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      properties: {
                        position: { type: "STRING" },
                        orientation: { type: "STRING" },
                        text: { type: "STRING" },
                        x1: { type: "NUMBER" },
                        y1: { type: "NUMBER" },
                        x2: { type: "NUMBER" },
                        y2: { type: "NUMBER" },
                      },
                      required: [
                        "position",
                        "orientation",
                        "text",
                        "x1",
                        "y1",
                        "x2",
                        "y2",
                      ],
                    },
                  },
                },
                required: ["roomName", "segments"],
              },
            },
          },
          required: ["rooms"],
        },
      },
    };

    try {
      const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${finalApiKey}`;
      const listRes = await fetch(listUrl);

      if (!listRes.ok) {
        const err = await listRes.json().catch(() => ({}));
        throw new Error(
          `[상태 코드 ${listRes.status}] 구글 API 서버 접근 거부: ${err.error?.message || "권한 없음"}`,
        );
      }

      const listData = await listRes.json();
      const availableModels = listData.models?.map((m) => m.name) || [];

      let targetModel =
        availableModels.find((m) => m.includes("gemini-1.5-pro")) ||
        availableModels.find((m) => m.includes("gemini-1.5-flash")) ||
        availableModels.find((m) => m.includes("gemini-1.0-pro")) ||
        availableModels.find((m) => m.includes("gemini"));

      if (!targetModel) {
        throw new Error(
          `이 API 키로는 접근 가능한 Gemini 모델이 전혀 없습니다.`,
        );
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/${targetModel}:generateContent?key=${finalApiKey}`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `[상태 코드 ${response.status}] 분석 중 서버 오류: ${errorData.error?.message || "알 수 없음"}`,
        );
      }

      const data = await response.json();
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (responseText) {
        const parsedResult = JSON.parse(responseText);
        if (parsedResult.rooms && parsedResult.rooms.length > 0) {
          setAnalysisResult(parsedResult);
        }
        setIsProcessing(false);
      } else {
        throw new Error("결과를 찾을 수 없습니다.");
      }
    } catch (err) {
      setError(`🚨 AI 통신 에러: ${err.message}`);
      setIsProcessing(false);
    }
  };

  // 💡 [핵심 업데이트] 붉은선 정가운데에서부터 보조선이 뻗어 나오도록 그리기 로직 전면 개편
  useEffect(() => {
    if (!imageSrc || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      if (analysisResult && analysisResult.plans) {
        const fontSize = Math.max(13, Math.floor(canvas.width * 0.012));
        const drawnTextBoxes = [];

        const checkCollision = (box1) => {
          return drawnTextBoxes.some((box2) => {
            return !(
              box1.right < box2.left ||
              box1.left > box2.right ||
              box1.bottom < box2.top ||
              box1.top > box2.bottom
            );
          });
        };

        analysisResult.plans.forEach((plan) => {
          if (!plan.segments || plan.segments.length === 0) return;

          const fillFactor = plan.fillFactor || 0.8;
          const pxTotalW = (plan.totalW / 100) * canvas.width;
          const pxTotalH = (plan.totalH / 100) * canvas.height;
          const bbPixelArea = pxTotalW * pxTotalH;
          const bbRealArea = plan.area / fillFactor;

          const uniformScale = Math.sqrt(bbRealArea / bbPixelArea);

          plan.segments.forEach((seg) => {
            let pxX1 = (seg.x1 / 100) * canvas.width;
            let pxY1 = (seg.y1 / 100) * canvas.height;
            let pxX2 = (seg.x2 / 100) * canvas.width;
            let pxY2 = (seg.y2 / 100) * canvas.height;

            if (seg.orientation === "horizontal") {
              const avgY = (pxY1 + pxY2) / 2;
              pxY1 = pxY2 = avgY;
              if (pxX1 > pxX2) {
                let t = pxX1;
                pxX1 = pxX2;
                pxX2 = t;
              }
            } else {
              const avgX = (pxX1 + pxX2) / 2;
              pxX1 = pxX2 = avgX;
              if (pxY1 > pxY2) {
                let t = pxY1;
                pxY1 = pxY2;
                pxY2 = t;
              }
            }

            const pxLen =
              seg.orientation === "horizontal"
                ? Math.abs(pxX2 - pxX1)
                : Math.abs(pxY2 - pxY1);
            const realLength = pxLen * uniformScale;

            if (realLength < 0.1) return;

            const prefix = seg.orientation === "horizontal" ? "W: " : "H: ";
            const text = `${prefix}${realLength.toFixed(1)}m`;

            const cx = (pxX1 + pxX2) / 2;
            const cy = (pxY1 + pxY2) / 2;

            const offset = Math.max(18, canvas.width * 0.018);
            const gap = 0;
            const overrun = 10;
            const tickSize = 5;

            ctx.save();
            const drawColor = "#2563eb";
            ctx.strokeStyle = drawColor;
            ctx.fillStyle = drawColor;
            ctx.lineWidth = Math.max(2, Math.floor(canvas.width * 0.002));

            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = `bold ${fontSize}px sans-serif`;
            const tw = ctx.measureText(text).width;

            if (seg.orientation === "horizontal") {
              const isTop = seg.position === "top";

              const yLine = isTop ? cy - offset : cy + offset;
              const extStart = isTop ? cy - gap : cy + gap;
              const extEnd = isTop ? yLine - overrun : yLine + overrun;

              ctx.beginPath();
              ctx.moveTo(pxX1, extStart);
              ctx.lineTo(pxX1, extEnd);
              ctx.moveTo(pxX2, extStart);
              ctx.lineTo(pxX2, extEnd);
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(pxX1, yLine);
              ctx.lineTo(pxX2, yLine);
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(pxX1 - tickSize, yLine + tickSize);
              ctx.lineTo(pxX1 + tickSize, yLine - tickSize);
              ctx.moveTo(pxX2 - tickSize, yLine + tickSize);
              ctx.lineTo(pxX2 + tickSize, yLine - tickSize);
              ctx.stroke();

              let textY = isTop
                ? yLine - fontSize * 0.8
                : yLine + fontSize * 0.8;
              let box = {
                left: cx - tw / 2 - 6,
                right: cx + tw / 2 + 6,
                top: textY - fontSize / 2 - 4,
                bottom: textY + fontSize / 2 + 4,
              };

              let shiftCount = 0;
              while (checkCollision(box) && shiftCount < 5) {
                textY += isTop ? -(fontSize * 1.5) : fontSize * 1.5;
                box.top = textY - fontSize / 2 - 4;
                box.bottom = textY + fontSize / 2 + 4;
                shiftCount++;
              }
              drawnTextBoxes.push(box);

              if (shiftCount > 0) {
                const originalTextY = isTop
                  ? yLine - fontSize * 0.8
                  : yLine + fontSize * 0.8;
                ctx.beginPath();
                ctx.moveTo(cx, originalTextY);
                ctx.lineTo(cx, isTop ? box.bottom : box.top);
                ctx.setLineDash([3, 3]);
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.lineWidth = Math.max(2, Math.floor(canvas.width * 0.002));
              }

              ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
              ctx.fillRect(
                box.left,
                box.top,
                box.right - box.left,
                box.bottom - box.top,
              );

              ctx.fillStyle = drawColor;
              ctx.fillText(text, cx, textY);
            } else {
              const isLeft = seg.position === "left";

              const xLine = isLeft ? cx - offset : cx + offset;
              const extStart = isLeft ? cx - gap : cx + gap;
              const extEnd = isLeft ? xLine - overrun : xLine + overrun;

              ctx.beginPath();
              ctx.moveTo(extStart, pxY1);
              ctx.lineTo(extEnd, pxY1);
              ctx.moveTo(extStart, pxY2);
              ctx.lineTo(extEnd, pxY2);
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(xLine, pxY1);
              ctx.lineTo(xLine, pxY2);
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(xLine - tickSize, pxY1 + tickSize);
              ctx.lineTo(xLine + tickSize, pxY1 - tickSize);
              ctx.moveTo(xLine - tickSize, pxY2 + tickSize);
              ctx.lineTo(xLine + tickSize, pxY2 - tickSize);
              ctx.stroke();

              let textX = isLeft ? xLine - tw / 2 - 8 : xLine + tw / 2 + 8;
              let box = {
                left: textX - tw / 2 - 6,
                right: textX + tw / 2 + 6,
                top: cy - fontSize / 2 - 4,
                bottom: cy + fontSize / 2 + 4,
              };

              let shiftCount = 0;
              while (checkCollision(box) && shiftCount < 5) {
                textX += isLeft ? -(tw * 0.8) : tw * 0.8;
                box.left = textX - tw / 2 - 6;
                box.right = textX + tw / 2 + 6;
                shiftCount++;
              }
              drawnTextBoxes.push(box);

              if (shiftCount > 0) {
                const originalTextX = isLeft
                  ? xLine - tw / 2 - 8
                  : xLine + tw / 2 + 8;
                ctx.beginPath();
                ctx.moveTo(xLine, cy);
                ctx.lineTo(isLeft ? box.right : box.left, cy);
                ctx.setLineDash([3, 3]);
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.lineWidth = Math.max(2, Math.floor(canvas.width * 0.002));
              }

              ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
              ctx.fillRect(
                box.left,
                box.top,
                box.right - box.left,
                box.bottom - box.top,
              );

              ctx.fillStyle = drawColor;
              ctx.fillText(text, textX, cy);
            }
            ctx.restore();
          });
        });
      }
    };
    img.src = imageSrc;
  }, [imageSrc, analysisResult]);

  const downloadImage = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = "평면도_사방치수선_완성.png";
    link.href = dataUrl;
    link.click();
  };

  const isButtonDisabled = !imageSrc || isProcessing || analysisResult !== null;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans p-4 sm:p-8 flex justify-center items-start">
      <div className="w-full max-w-2xl bg-white rounded-3xl border border-zinc-200/60 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col min-h-[85vh]">
        <div className="px-8 pt-8 pb-2">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3 text-zinc-900">
            <Frame className="w-6 h-6 text-zinc-900" />
            방별 외곽 벽면 치수 계산기
          </h1>
          <p className="text-zinc-500 text-sm mt-2.5 font-medium leading-relaxed">
            방을 구분하는 구획선(검은선)과 외곽선(붉은선)이 꺾이는 정가운데에서
            보조선을 확장합니다.
          </p>
        </div>

        <div className="px-8 pb-8 pt-4 flex flex-col gap-6 flex-1">
          <div className="flex flex-col gap-3">
            <label className="font-bold text-zinc-800 text-lg">
              1. 평면도 업로드
            </label>
            <label className="group border-2 border-dashed border-zinc-200 bg-zinc-50/50 hover:bg-zinc-50 hover:border-zinc-400 rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all duration-200">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <div className="flex gap-4 mb-4 text-zinc-400 group-hover:text-zinc-600 transition-colors duration-200">
                <Camera className="w-8 h-8" />
                <UploadCloud className="w-8 h-8" />
              </div>
              <span className="text-sm text-zinc-500 font-medium text-center">
                터치하여 사진 촬영 또는 갤러리에서 선택
              </span>
            </label>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm flex items-start gap-3 border border-red-100 whitespace-pre-line">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="font-medium leading-relaxed">{error}</p>
            </div>
          )}

          <button
            onClick={analyzeImage}
            disabled={isButtonDisabled}
            className={`w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-200 ${
              isButtonDisabled
                ? "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                : "bg-zinc-900 text-white hover:bg-zinc-800 shadow-md hover:shadow-lg hover:-translate-y-0.5"
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                선이 꺾이는 모서리를 찾아 치수 기점을 정렬하는 중...
              </>
            ) : analysisResult ? (
              "✅ 계산 완료 (새 도면을 올리면 다시 활성화됩니다)"
            ) : (
              "2. 각 방별 외곽/구획 치수선 그리기"
            )}
          </button>

          <div className="flex flex-col gap-3 flex-1 mt-2">
            <h2 className="text-sm font-bold text-zinc-800 tracking-wide">
              결과 미리보기
            </h2>
            <div className="bg-zinc-50/80 rounded-2xl border border-zinc-200 overflow-hidden flex items-center justify-center flex-1 min-h-[300px]">
              {!imageSrc ? (
                <div className="text-zinc-400 flex flex-col items-center gap-3">
                  <ImageIcon className="w-8 h-8 opacity-50" />
                  <span className="text-sm font-medium">
                    이미지가 여기에 표시됩니다.
                  </span>
                </div>
              ) : (
                <div className="relative w-full p-2">
                  <canvas
                    ref={canvasRef}
                    className="w-full h-auto block rounded-xl shadow-sm border border-zinc-100"
                  />
                </div>
              )}
            </div>
          </div>

          {analysisResult && (
            <button
              onClick={downloadImage}
              className="mt-1 w-full py-3.5 rounded-xl font-semibold text-zinc-700 bg-white border border-zinc-300 hover:bg-zinc-50 hover:border-zinc-400 flex items-center justify-center gap-2 transition-all duration-200"
            >
              <Download className="w-5 h-5" />
              결과 이미지 갤러리에 저장하기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
