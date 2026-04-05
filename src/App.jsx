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

  // 이미지 업로드 처리 함수
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

  // 제미나이 API 호출 함수
  const analyzeImage = async () => {
    if (!base64Data) {
      setError("도면 이미지를 업로드해주세요.");
      return;
    }

    setIsProcessing(true);
    setError("");

    // API 키 설정 및 최신 AI 모델(2.5버전) 이름으로 변경 완료!
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
        `🚨 오류: API 키가 설정되지 않았습니다. Vercel 환경 변수(VITE_GEMINI_API_KEY)를 다시 확인해 주세요.`,
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
              text: `다음은 건축 평면도 이미지야. \n\n**1단계 (매우 중요 - 절대 기준 찾기):** 도면 이미지 전체(특히 하단이나 우측의 표, 범례 등)를 읽어서 특정 구역의 '면적(㎡)'이나 '축척(Scale)' 정보가 글씨로 적혀 있는지 찾아내. 이를 바탕으로 완벽한 축척(Scale) 기준을 스스로 설정해.\n\n**2단계 (치수 계산 및 위치 지정):** 확정된 축척을 바탕으로, 도면 내에 존재하는 **모든 사각형 공간(방, 교실, 화장실, 복도 등 식별 가능한 모든 구획)**을 찾아내어, 각각의 가로(Width)와 세로(Height) 실제 예상 길이를 계산해줘.\n\n**[중요 - 수치 표시 위치]:** 수치를 표시할 X, Y 좌표(0~100 백분율)는 반드시 **"해당 사각형 공간의 정중앙(Center)"**으로 지정해줘. 방 한가운데에 글씨가 예쁘게 들어갈 수 있도록 말이야.\n\n각 구획에 대해 다음 정보를 제공해줘:\n1. 가로 길이 텍스트 (예: 'W: 4000mm')\n2. 세로 길이 텍스트 (예: 'H: 3000mm')\n3. 사각형 정중앙의 X, Y 좌표 (0~100 백분율)`,
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
            text: "너는 건축 도면을 분석하는 전문가 시스템이야. 도면 내의 모든 구획(방)을 찾아내어 가로/세로 길이를 계산하고, 해당 **방의 정중앙 좌표(X, Y)**를 추출해. 치수선 데이터(start/end)가 아니라 방 중앙의 단일 좌표만 필요해. 응답은 반드시 JSON(JavaScript Object Notation, 자바스크립트 객체 표기법) 형식이어야 해.",
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
                  widthText: {
                    type: "STRING",
                    description: "도출된 가로 길이 (예: W: 3000mm)",
                  },
                  heightText: {
                    type: "STRING",
                    description: "도출된 세로 길이 (예: H: 4000mm)",
                  },
                  x: {
                    type: "NUMBER",
                    description: "방 정중앙 X 좌표 백분율 (0-100)",
                  },
                  y: {
                    type: "NUMBER",
                    description: "방 정중앙 Y 좌표 백분율 (0-100)",
                  },
                },
                required: ["widthText", "heightText", "x", "y"],
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
          const errorData = await response.json().catch(() => ({}));
          let detailedError = "";

          if (errorData.error && errorData.error.message) {
            detailedError = ` (${errorData.error.message})`;
          } else if (response.status === 403) {
            detailedError = ` (이유: Vercel에 등록한 API 키가 유효하지 않거나, 사용할 권한이 없습니다.)`;
          } else if (response.status === 404) {
            detailedError = ` (이유: 요청한 AI 모델을 찾을 수 없습니다. 코드를 최신 버전으로 업데이트해야 합니다.)`;
          }

          throw new Error(`상태 코드: ${response.status}${detailedError}`);
        }

        const data = await response.json();
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (responseText) {
          const parsedResult = JSON.parse(responseText);
          setDimensions(parsedResult.dimensions || []);
          setIsProcessing(false);
          return;
        } else {
          throw new Error("API 응답에서 결과를 찾을 수 없습니다.");
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

          const wText = dim.widthText;
          const hText = dim.heightText;

          ctx.lineWidth = Math.max(2, fontSize * 0.25);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
          ctx.fillStyle = "#1e3a8a";

          if (wText) {
            ctx.strokeText(wText, xPos, yPos - fontSize * 0.5);
            ctx.fillText(wText, xPos, yPos - fontSize * 0.5);
          }

          if (hText) {
            const wWidth = wText ? ctx.measureText(wText).width : 0;
            ctx.save();
            ctx.translate(xPos + wWidth / 2 + fontSize * 0.8, yPos);
            ctx.rotate(-Math.PI / 2);
            ctx.strokeText(hText, 0, 0);
            ctx.fillText(hText, 0, 0);
            ctx.restore();
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
