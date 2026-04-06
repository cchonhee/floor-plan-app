import React, { useState, useRef, useEffect } from "react";
import {
  Image as ImageIcon,
  Download,
  AlertCircle,
  Loader2,
  Camera,
  UploadCloud,
  Sparkles,
} from "lucide-react";

export default function App() {
  const [imageSrc, setImageSrc] = useState(null);
  const [base64Data, setBase64Data] = useState(null);
  const [imageMimeType, setImageMimeType] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dimensions, setDimensions] = useState([]);
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
      setDimensions([]);
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

    let apiKey = "";
    const modelName = "gemini-2.5-flash";

    try {
      if (
        typeof import.meta !== "undefined" &&
        import.meta.env &&
        import.meta.env.VITE_GEMINI_API_KEY
      ) {
        apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      }
    } catch (e) {
      console.warn("환경 변수를 불러오지 못했습니다.", e);
    }

    if (!apiKey || apiKey.trim() === "") {
      setError(
        `🚨 오류: API 키가 설정되지 않았습니다. Vercel 환경 변수를 다시 확인해 주세요.`,
      );
      setIsProcessing(false);
      return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    // [핵심 로직 변경] 전체 면적(500.01㎡ 등)을 절대 기준으로 찾고, 방의 사각형 경계(Bounding Box)를 정확히 따내도록 명령합니다.
    const payload = {
      contents: [
        {
          parts: [
            {
              text: `다음은 건축 평면도 이미지야. 매우 정밀한 수학적 계산이 필요해.\n\n**1단계 (절대 기준 설정):** 도면 하단이나 우측의 표(Table)를 읽고, 붉은색 선 등으로 표시된 구역의 **"전체 면적(예: 500.01 ㎡ 등)"**이 숫자로 적혀 있는지 무조건 찾아내. 이것이 이 도면의 유일한 축척(Scale) 기준이야.\n\n**2단계 (방 경계선 인식):** 도면 내에 나뉘어 있는 각 방(개척실, 계단실, 송백실, 음악실, 음악준비실, 탐구실 등)의 위치를 찾아. 그리고 각 방을 둘러싸는 **정확한 직사각형 테두리(Bounding Box)**를 이미지 대비 백분율(0~100)로 추출해. (x: 왼쪽 끝, y: 위쪽 끝, w: 가로 폭, h: 세로 높이)\n\n**3단계 (비율 기반 역산 계산 - 가장 중요):** 1단계에서 찾은 전체 면적(예: 500.01㎡)과 각 방의 픽셀 비율(w * h)을 비교·역산하여, 각 방의 실제 가로(W) 길이와 세로(H) 길이를 도출해. 시각적으로 세면실처럼 가로가 확연히 길면 무조건 가로 수치가 길게 나와야 해. 소수점 첫째 자리 미터 단위(예: 13.0)로 계산해.`,
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
            text: "너는 도면의 표에서 '전체 면적'을 찾아내어 이를 바탕으로 각 방의 치수를 역산하는 건축 계산기야. 각 방의 테두리 좌표(x, y, w, h)를 정확하게 추출해 주어야 프론트엔드에서 치수보조선을 그릴 수 있어. 결과는 무조건 JSON 양식으로 출력해.",
          },
        ],
      },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            dimensions: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  roomName: {
                    type: "STRING",
                    description: "방 이름 (예: 음악실)",
                  },
                  widthText: {
                    type: "STRING",
                    description: "역산된 가로 길이 숫자만 (예: 13.0)",
                  },
                  heightText: {
                    type: "STRING",
                    description: "역산된 세로 길이 숫자만 (예: 5.0)",
                  },
                  x: {
                    type: "NUMBER",
                    description:
                      "방의 가장 왼쪽(Left) 경계선 X 좌표 백분율 (0-100)",
                  },
                  y: {
                    type: "NUMBER",
                    description:
                      "방의 가장 위쪽(Top) 경계선 Y 좌표 백분율 (0-100)",
                  },
                  w: {
                    type: "NUMBER",
                    description: "방의 가로 폭(Width) 백분율 (0-100)",
                  },
                  h: {
                    type: "NUMBER",
                    description: "방의 세로 높이(Height) 백분율 (0-100)",
                  },
                },
                required: [
                  "roomName",
                  "widthText",
                  "heightText",
                  "x",
                  "y",
                  "w",
                  "h",
                ],
              },
            },
          },
          required: ["dimensions"],
        },
      },
    };

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const delays = [1000, 2000, 4000, 8000, 16000];

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`상태 코드: ${response.status}`);
        }

        const data = await response.json();
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (responseText) {
          const parsedResult = JSON.parse(responseText);

          const uniqueDimensions = [];
          const seenRooms = new Set();

          (parsedResult.dimensions || []).forEach((dim) => {
            if (
              dim.widthText &&
              dim.w &&
              dim.h &&
              dim.roomName &&
              !seenRooms.has(dim.roomName)
            ) {
              seenRooms.add(dim.roomName);
              uniqueDimensions.push(dim);
            }
          });

          setDimensions(uniqueDimensions);
          setIsProcessing(false);
          return;
        } else {
          throw new Error("결과를 찾을 수 없습니다.");
        }
      } catch (err) {
        if (attempt === delays.length) {
          setError(
            "오류가 발생했습니다. 잠시 후 다시 시도해주세요. " + err.message,
          );
          setIsProcessing(false);
          return;
        }
        await sleep(delays[attempt]);
      }
    }
  };

  // [핵심 변경] 경계선(Bounding Box)을 기준으로 치수선(Dimension Line)과 치수보조선(Extension Line)을 그립니다.
  useEffect(() => {
    if (!imageSrc || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      if (dimensions && dimensions.length > 0) {
        const fontSize = Math.max(12, Math.floor(canvas.width * 0.009));

        // 치수선을 그리는 헬퍼 함수 (CAD 스타일)
        const drawCADLine = (
          startX,
          startY,
          endX,
          endY,
          text,
          type,
          roomBox,
        ) => {
          ctx.save();
          // 치수선 색상을 눈에 띄는 진한 파란색으로 설정
          ctx.strokeStyle = "#2563eb";
          ctx.fillStyle = "#2563eb";
          ctx.lineWidth = 2;

          // 벽면에서 얼마나 떨어져서 치수선을 그릴지(offset)
          const offset = Math.max(20, canvas.width * 0.02);
          // 양 끝 까치발(사선)의 크기
          const tickSize = 6;

          ctx.beginPath();

          if (type === "W") {
            // 가로(W): 방의 아래쪽(Bottom) 경계선 안쪽으로 살짝 올려서 치수선 생성 (주변 방 간섭 최소화)
            const yLine = roomBox.bottom - offset;

            // 치수보조선 (양 끝에서 위로 올라오는 선)
            ctx.moveTo(startX, roomBox.bottom);
            ctx.lineTo(startX, yLine - tickSize);
            ctx.moveTo(endX, roomBox.bottom);
            ctx.lineTo(endX, yLine - tickSize);
            ctx.stroke();

            // 치수선 (가로로 쭉 긋는 선)
            ctx.beginPath();
            ctx.moveTo(startX, yLine);
            ctx.lineTo(endX, yLine);
            ctx.stroke();

            // 까치발 (양 끝 사선 틱)
            ctx.beginPath();
            ctx.moveTo(startX - tickSize, yLine + tickSize);
            ctx.lineTo(startX + tickSize, yLine - tickSize);
            ctx.moveTo(endX - tickSize, yLine + tickSize);
            ctx.lineTo(endX + tickSize, yLine - tickSize);
            ctx.stroke();

            // 텍스트 그리기 (선을 파먹지 않도록 흰색 배경 깔기)
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = `bold ${fontSize}px sans-serif`;
            const displayText = `W: ${text}m`;
            const tw = ctx.measureText(displayText).width;

            ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
            ctx.fillRect(
              startX + (endX - startX) / 2 - tw / 2 - 4,
              yLine - fontSize * 0.6,
              tw + 8,
              fontSize * 1.2,
            );

            ctx.fillStyle = "#1e3a8a"; // 더 진한 네이비색 글씨
            ctx.fillText(displayText, startX + (endX - startX) / 2, yLine);
          } else if (type === "H") {
            // 세로(H): 방의 왼쪽(Left) 경계선 안쪽으로 살짝 밀어서 치수선 생성
            const xLine = roomBox.left + offset;

            // 치수보조선
            ctx.beginPath();
            ctx.moveTo(roomBox.left, startY);
            ctx.lineTo(xLine + tickSize, startY);
            ctx.moveTo(roomBox.left, endY);
            ctx.lineTo(xLine + tickSize, endY);
            ctx.stroke();

            // 치수선
            ctx.beginPath();
            ctx.moveTo(xLine, startY);
            ctx.lineTo(xLine, endY);
            ctx.stroke();

            // 까치발
            ctx.beginPath();
            ctx.moveTo(xLine - tickSize, startY + tickSize);
            ctx.lineTo(xLine + tickSize, startY - tickSize);
            ctx.moveTo(xLine - tickSize, endY + tickSize);
            ctx.lineTo(xLine + tickSize, endY - tickSize);
            ctx.stroke();

            // 텍스트 그리기 (가로로 보기 편하게)
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = `bold ${fontSize}px sans-serif`;
            const displayText = `H: ${text}m`;
            const tw = ctx.measureText(displayText).width;

            ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
            ctx.fillRect(
              xLine - tw / 2 - 4,
              startY + (endY - startY) / 2 - fontSize * 0.6,
              tw + 8,
              fontSize * 1.2,
            );

            ctx.fillStyle = "#1e3a8a";
            ctx.fillText(displayText, xLine, startY + (endY - startY) / 2);
          }
          ctx.restore();
        };

        dimensions.forEach((dim) => {
          // AI가 찾아준 방의 4면 경계선 (퍼센트를 픽셀로 변환)
          const left = (dim.x / 100) * canvas.width;
          const top = (dim.y / 100) * canvas.height;
          const width = (dim.w / 100) * canvas.width;
          const height = (dim.h / 100) * canvas.height;
          const right = left + width;
          const bottom = top + height;

          const roomBox = { left, top, right, bottom };

          // W(가로) 치수선 그리기 (방 아래쪽 라인)
          if (dim.widthText) {
            drawCADLine(
              left,
              bottom,
              right,
              bottom,
              dim.widthText,
              "W",
              roomBox,
            );
          }

          // H(세로) 치수선 그리기 (방 왼쪽 라인)
          if (dim.heightText) {
            drawCADLine(left, top, left, bottom, dim.heightText, "H", roomBox);
          }
        });
      }
    };
    img.src = imageSrc;
  }, [imageSrc, dimensions]);

  const downloadImage = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = "평면도_수치완성.png";
    link.href = dataUrl;
    link.click();
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans p-4 sm:p-6 flex justify-center items-start">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col min-h-[90vh]">
        <div className="bg-linear-to-r from-indigo-600 to-blue-500 p-6 text-white">
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-indigo-200" />
            도면 수치 자동 입력기
          </h1>
          <p className="text-indigo-100 text-sm mt-2 font-medium opacity-90">
            AI가 도면을 읽고 치수선을 그려줍니다.
          </p>
        </div>

        <div className="p-6 flex flex-col gap-6 flex-1">
          <div className="flex flex-col gap-3">
            <label className="font-bold text-slate-700 text-lg">
              1. 평면도 업로드
            </label>
            <label className="group border-2 border-dashed border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-300">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <div className="flex gap-4 mb-3 text-indigo-400 group-hover:text-indigo-600 transition-colors duration-300">
                <Camera className="w-10 h-10" />
                <UploadCloud className="w-10 h-10" />
              </div>
              <span className="text-sm text-slate-500 font-semibold text-center">
                터치하여 사진 촬영
                <br />
                또는 갤러리에서 선택
              </span>
            </label>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm flex items-start gap-3 border border-red-100">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="font-medium">{error}</p>
            </div>
          )}

          <button
            onClick={analyzeImage}
            disabled={!imageSrc || isProcessing}
            className={`w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all duration-300 shadow-lg ${
              !imageSrc || isProcessing
                ? "bg-slate-300 shadow-none cursor-not-allowed text-slate-500"
                : "bg-linear-to-r from-indigo-600 to-blue-500 hover:shadow-indigo-500/30 hover:-translate-y-0.5 active:translate-y-0"
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                AI가 비율을 계산하여 선을 긋고 있습니다...
              </>
            ) : (
              "수치 역산 및 치수선 그리기"
            )}
          </button>

          <div className="flex flex-col gap-3 flex-1">
            <label className="font-bold text-slate-700 text-lg">
              결과 미리보기
            </label>
            <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden flex items-center justify-center flex-1 min-h-62.5">
              {!imageSrc ? (
                <div className="text-slate-400 flex flex-col items-center gap-3">
                  <ImageIcon className="w-10 h-10 opacity-50" />
                  <span className="text-sm font-medium">
                    이미지를 업로드하면 표시됩니다.
                  </span>
                </div>
              ) : (
                <div className="relative w-full p-2">
                  <canvas
                    ref={canvasRef}
                    className="w-full h-auto block rounded-xl shadow-sm"
                  />
                </div>
              )}
            </div>
          </div>

          {dimensions.length > 0 && (
            <button
              onClick={downloadImage}
              className="mt-2 w-full py-4 bg-slate-800 hover:bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors duration-300 shadow-md"
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
