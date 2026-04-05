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

    const payload = {
      contents: [
        {
          parts: [
            {
              text: `다음은 건축 평면도 이미지야. \n\n**1단계:** 도면 내의 면적이나 축척 정보를 찾아 기준을 설정해.\n\n**2단계 (가장 중요):** 도면 전체를 하나의 큰 방으로 묶지 마! 도면에 선으로 나뉘어 있고 글씨로 용도가 적혀 있는 **모든 개별 방과 공간(예: 창고, 화장실, 탈의실, 세면실, 숙직실, 시설관리실, 매점, 탁구장 등)을 하나도 빠짐없이 모두** 찾아내.\n\n**3단계:** 식별된 '각각의 개별 방마다' 따로따로 가로(W)와 세로(H) 길이를 계산해. 만약 방이 8개라면 결과 데이터도 8개가 나와야 해.\n\n**[위치 지정 규칙]:** X, Y 좌표는 선 위가 아니라 **"해당 개별 방 내부 빈 공간의 정중앙"** 백분율(0~100) 좌표여야 해.`,
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
            text: "너는 건축 도면을 분석하는 전문가 시스템이야. 굵은 테두리에 속지 말고, 내부의 얇은 선들로 구분된 '개별 방 단위'로 쪼개서 분석해. 반드시 JSON(JavaScript Object Notation, 자바스크립트 객체 표기법 - 데이터를 주고받는 표준 양식) 형식으로, 도면에 있는 모든 방의 개수만큼 여러 개의 데이터를 배열에 담아 응답해.",
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
                    description:
                      "인식된 방의 이름 (예: 창고, 화장실 - 이 정보를 바탕으로 구역 분리)",
                  },
                  widthText: {
                    type: "STRING",
                    description: "가로 길이 (예: W: 3000mm)",
                  },
                  heightText: {
                    type: "STRING",
                    description: "세로 길이 (예: H: 4000mm)",
                  },
                  x: {
                    type: "NUMBER",
                    description: "해당 방 내부 정중앙 X 좌표 백분율 (0-100)",
                  },
                  y: {
                    type: "NUMBER",
                    description: "해당 방 내부 정중앙 Y 좌표 백분율 (0-100)",
                  },
                },
                required: ["roomName", "widthText", "heightText", "x", "y"],
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
          setDimensions(parsedResult.dimensions || []);
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
        const fontSize = Math.max(10, Math.floor(canvas.width * 0.01));
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        dimensions.forEach((dim) => {
          const xPos = (dim.x / 100) * canvas.width;
          const yPos = (dim.y / 100) * canvas.height;

          const wText = dim.widthText || "";
          const hText = dim.heightText || "";

          const wWidth = ctx.measureText(wText).width;
          const hWidth = ctx.measureText(hText).width;
          const maxWidth = Math.max(wWidth, hWidth);

          const paddingX = fontSize * 0.8;
          const paddingY = fontSize * 0.6;
          const boxWidth = maxWidth + paddingX * 2;
          const boxHeight = wText && hText ? fontSize * 2.5 : fontSize * 1.5;

          // 배경 박스 (말풍선) 그리기
          ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(
              xPos - boxWidth / 2,
              yPos - boxHeight / 2,
              boxWidth,
              boxHeight,
              6,
            );
          } else {
            ctx.rect(
              xPos - boxWidth / 2,
              yPos - boxHeight / 2,
              boxWidth,
              boxHeight,
            );
          }
          ctx.fill();

          ctx.lineWidth = 1;
          ctx.strokeStyle = "#4f46e5";
          ctx.stroke();

          // 글씨 그리기
          ctx.fillStyle = "#1e3a8a";

          if (wText && hText) {
            ctx.fillText(wText, xPos, yPos - fontSize * 0.6);
            ctx.fillText(hText, xPos, yPos + fontSize * 0.6);
          } else if (wText || hText) {
            ctx.fillText(wText || hText, xPos, yPos);
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
      <div className="w-full max-w-lg bg-white rounded-[2rem] shadow-xl overflow-hidden flex flex-col min-h-[90vh]">
        {/* 상단 헤더: bg-gradient-to-r 로 원래 색상 복구 */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-500 p-6 text-white">
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-indigo-200" />
            도면 수치 자동 입력기
          </h1>
          <p className="text-indigo-100 text-sm mt-2 font-medium opacity-90">
            AI가 도면을 읽고 방 크기를 계산해 줍니다.
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

          {/* 에러 메시지 */}
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm flex items-start gap-3 border border-red-100">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="font-medium">{error}</p>
            </div>
          )}

          {/* 계산 버튼: bg-gradient-to-r 로 원래 색상 복구 */}
          <button
            onClick={analyzeImage}
            disabled={!imageSrc || isProcessing}
            className={`w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all duration-300 shadow-lg ${
              !imageSrc || isProcessing
                ? "bg-slate-300 shadow-none cursor-not-allowed text-slate-500"
                : "bg-gradient-to-r from-indigo-600 to-blue-500 hover:shadow-indigo-500/30 hover:-translate-y-0.5 active:translate-y-0"
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                AI가 도면을 분석 중입니다...
              </>
            ) : (
              "수치 계산 및 도면에 그리기"
            )}
          </button>

          <div className="flex flex-col gap-3 flex-1">
            <label className="font-bold text-slate-700 text-lg">
              결과 미리보기
            </label>
            <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden flex items-center justify-center flex-1 min-h-[250px]">
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
