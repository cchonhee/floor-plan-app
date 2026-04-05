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

    // [핵심 변경] W, H 약자 추가 및 '시각적 비율(가로가 긴지 세로가 긴지)'을 강제로 확인하도록 명령했습니다.
    const payload = {
      contents: [
        {
          parts: [
            {
              text: `다음은 건축 평면도 이미지야.\n\n1단계: 도면에 적힌 모든 '방 이름(용도)' 글씨를 찾아내.\n\n2단계 (비율 및 치수 계산 - 매우 중요!): 각 방의 가로(W), 세로(H) 길이를 계산해. 이때 **반드시 시각적으로 방의 형태(가로가 긴 직사각형인지, 세로가 긴 직사각형인지)를 확인해!** 예를 들어 '세면실'처럼 눈으로 보기에 가로가 확연히 긴데 W와 H를 똑같이 계산하면 완전히 틀린 거야. 시각적 비율에 맞게 정확히 계산해.\n\n3단계 (단위 및 포맷): 계산된 길이는 미터(m) 단위로 소수점 첫째 자리까지 변환하고, 반드시 앞에 약자를 붙여서 **'W: 3.6m', 'H: 2.4m'** 형식으로 출력해.\n\n4단계 (위치): 수치를 표시할 X, Y 좌표(0~100)는 복잡하게 생각하지 말고, 도면에 인쇄된 **"해당 방 이름 글씨의 한가운데(Center)"** 좌표로 통일해서 찍어. (동일한 방은 무조건 1개만 출력해!)`,
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
            text: "너는 도면 치수 계산 전문가야. 시각적 가로/세로 비율을 엄격히 따져서 계산해. 형식은 반드시 'W: 0.0m', 'H: 0.0m'로 출력하고, 좌표는 방 이름 텍스트의 중앙으로 잡아. JSON 형식으로만 응답해.",
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
                    description: "방 이름 (예: 세면실)",
                  },
                  widthText: {
                    type: "STRING",
                    description: "가로 길이 (예: W: 3.6m)",
                  },
                  heightText: {
                    type: "STRING",
                    description: "세로 길이 (예: H: 2.4m)",
                  },
                  x: {
                    type: "NUMBER",
                    description: "방 이름 '글씨'의 정중앙 X 좌표 백분율",
                  },
                  y: {
                    type: "NUMBER",
                    description: "방 이름 '글씨'의 정중앙 Y 좌표 백분율",
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
          // AI가 찾은 '방 이름 글씨'의 중앙 좌표
          const textCenterX = (dim.x / 100) * canvas.width;
          const textCenterY = (dim.y / 100) * canvas.height;

          const wText = dim.widthText || "";
          const hText = dim.heightText || "";

          // W, H 텍스트 너비 계산
          const wWidth = ctx.measureText(wText).width;
          const hWidth = ctx.measureText(hText).width;
          const maxWidth = Math.max(wWidth, hWidth);

          const paddingX = fontSize * 0.8;
          const boxWidth = maxWidth + paddingX * 2;
          // 텍스트 2줄(W, H)만 들어가도록 박스 높이 축소
          const boxHeight = wText && hText ? fontSize * 2.6 : fontSize * 1.5;

          // [핵심] 상자를 '방 이름 글씨' 바로 아래(약 1.5배 높이만큼 밑)에 배치합니다.
          // 방 이름표를 상자 안에 넣지 않으므로 더욱 깔끔합니다.
          const yOffset = fontSize * 1.8;
          const boxCenterY = textCenterY + yOffset;

          // 파란색 테두리 하얀 상자 그리기
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
          ctx.strokeStyle = "#2563eb";
          ctx.stroke();

          // W, H 수치 텍스트 그리기
          ctx.fillStyle = "#2563eb";
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
