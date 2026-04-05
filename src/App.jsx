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

    // 프롬프트를 아주 단순하고 강력하게 바꿨습니다. "글씨 위치를 찾아라, 그리고 중복해서 대답하지 마라!"
    const payload = {
      contents: [
        {
          parts: [
            {
              text: `다음은 건축 평면도 이미지야.\n\n1단계: 도면의 축척을 파악해.\n\n2단계: 도면에 적힌 '방 이름(용도) 글씨' (예: 창고, 탈의실, 매점 등)를 OCR로 읽어내고, 그 방의 가로(W), 세로(H) 길이를 무조건 계산해.\n\n3단계 (위치): X, Y 좌표(0~100)는 테두리가 아니라 **네가 읽어낸 '방 이름 글씨'의 한가운데 위치**로 찍어.\n\n4단계 (절대 규칙): 격자무늬에 속지 마! 동일한 방 이름(예: '매점')에 대해서는 **절대 2개 이상 데이터를 만들지 말고 딱 1개만** 출력해!`,
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
            text: "너는 도면 OCR 및 치수 계산 AI야. 방 이름 글씨의 X, Y 좌표를 찾고 수치를 계산해. 데이터 중복을 절대 금지하며, 방 이름 1개당 데이터 1개만 JSON 양식으로 출력해.",
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
                    description: "방 이름 (예: 매점)",
                  },
                  widthText: { type: "STRING", description: "가로 길이" },
                  heightText: { type: "STRING", description: "세로 길이" },
                  x: {
                    type: "NUMBER",
                    description: "방 이름 '글씨'의 X 좌표 백분율",
                  },
                  y: {
                    type: "NUMBER",
                    description: "방 이름 '글씨'의 Y 좌표 백분율",
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

          // [코드 레벨의 완벽한 안전장치]
          // AI가 말을 안 듣고 '매점'을 3개씩 만들면, 여기서 강제로 첫 번째 '매점' 하나만 남기고 다 버립니다!
          const uniqueDimensions = [];
          const seenRooms = new Set();

          (parsedResult.dimensions || []).forEach((dim) => {
            if (
              dim.widthText &&
              !dim.widthText.includes("N/A") &&
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
        const fontSize = Math.max(10, Math.floor(canvas.width * 0.009));
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        dimensions.forEach((dim) => {
          // AI가 찾아낸 글씨의 정중앙 좌표
          const textCenterX = (dim.x / 100) * canvas.width;
          const textCenterY = (dim.y / 100) * canvas.height;

          const wText = dim.widthText || "";
          const hText = dim.heightText || "";

          const wWidth = ctx.measureText(wText).width;
          const hWidth = ctx.measureText(hText).width;
          const maxWidth = Math.max(wWidth, hWidth);

          const paddingX = fontSize * 0.8;
          const boxWidth = maxWidth + paddingX * 2;
          const boxHeight = wText && hText ? fontSize * 2.4 : fontSize * 1.4;

          // 글씨를 가리지 않게 살짝만 아래로 내립니다.
          const yOffset = fontSize * 1.3;
          const boxCenterY = textCenterY + yOffset;

          // 박스 그리기
          ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(
              textCenterX - boxWidth / 2,
              boxCenterY - boxHeight / 2,
              boxWidth,
              boxHeight,
              4,
            );
          } else {
            ctx.rect(
              textCenterX - boxWidth / 2,
              boxCenterY - boxHeight / 2,
              boxWidth,
              boxHeight,
            );
          }
          ctx.fill();

          ctx.lineWidth = 1.5;
          ctx.strokeStyle = "#4f46e5";
          ctx.stroke();

          // 글씨 그리기
          ctx.fillStyle = "#1e3a8a";
          if (wText && hText) {
            ctx.fillText(wText, textCenterX, boxCenterY - fontSize * 0.6);
            ctx.fillText(hText, textCenterX, boxCenterY + fontSize * 0.6);
          } else if (wText || hText) {
            ctx.fillText(wText || hText, textCenterX, boxCenterY);
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
