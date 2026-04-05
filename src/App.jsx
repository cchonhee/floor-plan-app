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

    // [핵심 변경] 방의 수치를 계산하되, 출력 좌표는 강제로 '글자'의 중앙을 찍도록 속성명을 명확히 지정했습니다.
    const payload = {
      contents: [
        {
          parts: [
            {
              text: `다음은 건축 평면도 이미지야. \n\n**1단계 (스케일 파악):** 도면 내의 면적이나 축척 정보를 찾아 기준을 설정해.\n\n**2단계 (치수 계산):** 도면에 글씨로 적혀 있는 각 방(창고, 화장실, 탈의실 등)을 감싸고 있는 사각형의 가로(W)와 세로(H) 길이를 계산해. (절대 N/A를 쓰지 말고 숫자로 유추해)\n\n**3단계 (가운데 정렬을 위한 글자 위치 찾기 - 가장 중요):** 방의 수치를 그릴 기준점을 잡아야 해. 도면에 인쇄된 **"방 이름 글자(예: '시설관리실')" 자체의 정중앙 X, Y 좌표**를 백분율(0~100)로 정확히 찾아줘. 방의 중심이나 벽면이 아니라, 오직 '글자'의 중심이어야 우리가 그 글자 바로 아래에 수치를 가운데 정렬할 수 있어.`,
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
            text: "너는 건축 도면 AI야. 각 방의 가로/세로 길이를 계산하고, 좌표는 무조건 '방 이름 텍스트'의 한가운데(Center)로 지정해. 속성명 textCenterX, textCenterY에 글자의 좌표를 넣어.",
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
                    description: "인식된 방의 이름 (예: 시설관리실)",
                  },
                  widthText: {
                    type: "STRING",
                    description: "계산된 가로 길이 (예: W: 3000mm)",
                  },
                  heightText: {
                    type: "STRING",
                    description: "계산된 세로 길이 (예: H: 4000mm)",
                  },
                  textCenterX: {
                    type: "NUMBER",
                    description:
                      "방 이름 '글자' 자체의 정중앙 X 좌표 (0-100). 절대 방 모서리가 아님.",
                  },
                  textCenterY: {
                    type: "NUMBER",
                    description:
                      "방 이름 '글자' 자체의 정중앙 Y 좌표 (0-100). 절대 방 모서리가 아님.",
                  },
                },
                required: [
                  "roomName",
                  "widthText",
                  "heightText",
                  "textCenterX",
                  "textCenterY",
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
          // N/A 값이 실수로 넘어와도 그리지 않도록 방어하는 코드를 추가했습니다.
          const validDimensions = (parsedResult.dimensions || []).filter(
            (dim) => dim.widthText && !dim.widthText.includes("N/A"),
          );
          setDimensions(validDimensions);
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
        const fontSize = Math.max(9, Math.floor(canvas.width * 0.0085));
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        dimensions.forEach((dim) => {
          // AI가 찾은 '글자'의 중앙 좌표 (새로운 속성명 textCenterX, textCenterY 적용)
          const xValue =
            dim.textCenterX !== undefined ? dim.textCenterX : dim.x;
          const yValue =
            dim.textCenterY !== undefined ? dim.textCenterY : dim.y;

          const textCenterX = (xValue / 100) * canvas.width;
          const textCenterY = (yValue / 100) * canvas.height;

          const wText = dim.widthText || "";
          const hText = dim.heightText || "";

          const wWidth = ctx.measureText(wText).width;
          const hWidth = ctx.measureText(hText).width;
          const maxWidth = Math.max(wWidth, hWidth);

          const paddingX = fontSize * 0.6;
          const boxWidth = maxWidth + paddingX * 2;
          const boxHeight = wText && hText ? fontSize * 2.3 : fontSize * 1.3;

          const yOffset = fontSize * 1.5;
          const boxCenterY = textCenterY + yOffset + boxHeight / 2;

          // 말풍선 박스 그리기
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

          ctx.lineWidth = 1;
          ctx.strokeStyle = "#4f46e5";
          ctx.stroke();

          // 수치 글씨 그리기
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
    <div className="min-h-screen bg-slate-900 font-sans p-4 sm:p-6 flex justify-center items-start">
      <div className="w-full max-w-lg bg-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col min-h-[90vh] border border-slate-700">
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
            <label className="font-bold text-slate-200 text-lg">
              1. 평면도 업로드
            </label>
            <label className="group border-2 border-dashed border-slate-600 bg-slate-700/30 hover:bg-slate-700/60 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-300">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <div className="flex gap-4 mb-3 text-indigo-400 group-hover:text-indigo-300 transition-colors duration-300">
                <Camera className="w-10 h-10" />
                <UploadCloud className="w-10 h-10" />
              </div>
              <span className="text-sm text-slate-400 font-semibold text-center group-hover:text-slate-300 transition-colors duration-300">
                터치하여 사진 촬영
                <br />
                또는 갤러리에서 선택
              </span>
            </label>
          </div>

          {error && (
            <div className="bg-red-500/10 text-red-400 p-4 rounded-2xl text-sm flex items-start gap-3 border border-red-500/20">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="font-medium">{error}</p>
            </div>
          )}

          <button
            onClick={analyzeImage}
            disabled={!imageSrc || isProcessing}
            className={`w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all duration-300 shadow-lg ${
              !imageSrc || isProcessing
                ? "bg-slate-700 shadow-none cursor-not-allowed text-slate-500"
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
            <label className="font-bold text-slate-200 text-lg">
              결과 미리보기
            </label>
            <div className="bg-slate-900 rounded-2xl border border-slate-700 overflow-hidden flex items-center justify-center flex-1 min-h-[250px]">
              {!imageSrc ? (
                <div className="text-slate-500 flex flex-col items-center gap-3">
                  <ImageIcon className="w-10 h-10 opacity-30" />
                  <span className="text-sm font-medium">
                    이미지를 업로드하면 표시됩니다.
                  </span>
                </div>
              ) : (
                <div className="relative w-full p-2">
                  <canvas
                    ref={canvasRef}
                    className="w-full h-auto block rounded-xl shadow-sm border border-slate-700"
                  />
                </div>
              )}
            </div>
          </div>

          {dimensions.length > 0 && (
            <button
              onClick={downloadImage}
              className="mt-2 w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors duration-300 shadow-md"
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
