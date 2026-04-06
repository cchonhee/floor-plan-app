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

    // [핵심 변경 1] 500.01㎡를 절대 기준으로 주고 수학적 비율 역산을 강제합니다.
    const payload = {
      contents: [
        {
          parts: [
            {
              text: `다음은 건축 평면도 이미지야. 매우 정밀한 수학적 계산이 필요해.\n\n**1단계 (절대 기준 설정 - 가장 중요!):** 도면 하단의 표를 보면 붉은색 선으로 표시된 구역(4층 탐구실, 음악준비실, 음악실, 송백실, 개척실, 계단실2 등)의 전체 면적이 **"500.01 ㎡"**라고 명시되어 있어. 이 500.01㎡가 모든 길이를 구하는 유일하고 절대적인 단서야!\n\n**2단계 (방 경계선 및 면적 역산):** 붉은 테두리 내부에 있는 각 방의 영역을 찾아내. 그리고 1단계에서 확인한 전체 면적(500.01㎡)을 기준으로 각 방이 차지하는 픽셀 면적 비율을 수학적으로 계산해서, 각 방의 실제 가로(W)와 세로(H) 길이를 역산해내. (예: 13.0m 등 소수점 첫째 자리까지)\n\n**3단계 (좌표 추출):** 치수보조선을 그리기 위해 각 방의 테두리를 정확히 따내야 해. 각 방을 감싸는 직사각형(Bounding Box)의 가장 왼쪽(x), 위쪽(y) 좌표와 가로 너비(w), 세로 높이(h)를 도면 전체 크기 대비 백분율(0~100)로 추출해.`,
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
            text: "너는 도면의 표에서 '전체 면적(500.01 등)'을 찾아내어 이를 바탕으로 각 방의 치수를 수학적으로 역산하는 건축 계산기야. 각 방의 테두리 좌표(x, y, w, h)를 정확하게 추출해 주어야 프론트엔드에서 치수보조선을 그릴 수 있어. 결과는 JSON 양식으로 출력해.",
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
                    description: "방 이름 (예: 송백실)",
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

  // [핵심 변경 2] 진짜 CAD 스타일 치수선 & 치수보조선 그리기 로직
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
        // 도면 해상도에 비례한 폰트 및 선 굵기 설정
        const fontSize = Math.max(14, Math.floor(canvas.width * 0.012));
        const strokeWidth = Math.max(2, Math.floor(canvas.width * 0.002));

        // 치수선 그리기 함수 (AutoCAD 스타일)
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
          ctx.strokeStyle = "#2563eb"; // 선명한 파란색
          ctx.fillStyle = "#2563eb";
          ctx.lineWidth = strokeWidth;

          // CAD 선 그리기 세팅값
          const offset = Math.max(30, canvas.width * 0.035); // 치수선을 벽에서 얼마나 띄울지
          const gap = 5; // 벽과 치수보조선 사이의 아주 얇은 틈 (CAD 도면 국룰)
          const overrun = 10; // 치수선을 넘어가는 치수보조선의 꼬리 길이
          const tickSize = 6; // 대각선 까치발(Tick) 크기

          ctx.beginPath();

          if (type === "W") {
            // W(가로): 방의 '아래쪽'으로 치수선을 뺍니다.
            const yLine = roomBox.bottom + offset;

            // 1. 치수보조선 (양 끝에서 아래로 내려오는 선)
            ctx.moveTo(startX, roomBox.bottom + gap);
            ctx.lineTo(startX, yLine + overrun);
            ctx.moveTo(endX, roomBox.bottom + gap);
            ctx.lineTo(endX, yLine + overrun);
            ctx.stroke();

            // 2. 치수선 (가로로 가로지르는 선)
            ctx.beginPath();
            ctx.moveTo(startX, yLine);
            ctx.lineTo(endX, yLine);
            ctx.stroke();

            // 3. 까치발 (대각선 틱)
            ctx.beginPath();
            ctx.moveTo(startX - tickSize, yLine + tickSize);
            ctx.lineTo(startX + tickSize, yLine - tickSize);
            ctx.moveTo(endX - tickSize, yLine + tickSize);
            ctx.lineTo(endX + tickSize, yLine - tickSize);
            ctx.stroke();

            // 4. 수치 텍스트 배치
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.font = `bold ${fontSize}px sans-serif`;
            const displayText = `W: ${text}m`;
            const tw = ctx.measureText(displayText).width;

            // 텍스트 뒤에 얇은 흰색 배경을 깔아 선과 겹쳐도 잘 보이게 함
            ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
            ctx.fillRect(
              startX + (endX - startX) / 2 - tw / 2 - 4,
              yLine - fontSize - 2,
              tw + 8,
              fontSize + 4,
            );

            ctx.fillStyle = "#1e3a8a"; // 텍스트는 더 짙은 네이비색
            ctx.fillText(displayText, startX + (endX - startX) / 2, yLine - 2);
          } else if (type === "H") {
            // H(세로): 방의 '왼쪽'으로 치수선을 뺍니다.
            const xLine = roomBox.left - offset;

            // 1. 치수보조선 (양 끝에서 왼쪽으로 뻗어나가는 선)
            ctx.beginPath();
            ctx.moveTo(roomBox.left - gap, startY);
            ctx.lineTo(xLine - overrun, startY);
            ctx.moveTo(roomBox.left - gap, endY);
            ctx.lineTo(xLine - overrun, endY);
            ctx.stroke();

            // 2. 치수선 (세로로 가로지르는 선)
            ctx.beginPath();
            ctx.moveTo(xLine, startY);
            ctx.lineTo(xLine, endY);
            ctx.stroke();

            // 3. 까치발
            ctx.beginPath();
            ctx.moveTo(xLine - tickSize, startY + tickSize);
            ctx.lineTo(xLine + tickSize, startY - tickSize);
            ctx.moveTo(xLine - tickSize, endY + tickSize);
            ctx.lineTo(xLine + tickSize, endY - tickSize);
            ctx.stroke();

            // 4. 수치 텍스트 배치 (회전 없이 정방향으로, 선 왼쪽에 배치)
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            ctx.font = `bold ${fontSize}px sans-serif`;
            const displayText = `H: ${text}m`;
            const tw = ctx.measureText(displayText).width;

            ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
            ctx.fillRect(
              xLine - tw - 10,
              startY + (endY - startY) / 2 - fontSize / 2 - 2,
              tw + 8,
              fontSize + 4,
            );

            ctx.fillStyle = "#1e3a8a";
            ctx.fillText(displayText, xLine - 6, startY + (endY - startY) / 2);
          }
          ctx.restore();
        };

        dimensions.forEach((dim) => {
          // AI가 찾은 방의 4면 경계선을 픽셀로 변환
          const left = (dim.x / 100) * canvas.width;
          const top = (dim.y / 100) * canvas.height;
          const width = (dim.w / 100) * canvas.width;
          const height = (dim.h / 100) * canvas.height;
          const right = left + width;
          const bottom = top + height;

          const roomBox = { left, top, right, bottom };

          // W(가로) 치수선 그리기
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

          // H(세로) 치수선 그리기
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
    link.download = "평면도_치수선완성.png";
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
            면적 기반 역산 & CAD 스타일 치수선 표기
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
                전체 면적으로 역산 및 치수선 생성 중...
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
