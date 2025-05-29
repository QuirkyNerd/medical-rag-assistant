import React, { ChangeEvent, useState } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import SocialMediaLinks from './social-links';
import { useToast } from "@/components/ui/use-toast";

type Props = {
    onReportConfirmation: (data: string) => void;
};

const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const SUPPORTED_DOC_TYPES = ['application/pdf'];
const MAX_FILE_SIZE_MB = 5;
const ACCEPTED_FILE_TYPES = [...SUPPORTED_IMAGE_TYPES, ...SUPPORTED_DOC_TYPES].join(',');

const ReportComponent = ({ onReportConfirmation }: Props) => {
    const { toast } = useToast();
    const [base64Data, setBase64Data] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [reportData, setReportData] = useState("");
    const [fileName, setFileName] = useState("");

    function handleReportSelection(event: ChangeEvent<HTMLInputElement>): void {
        if (!event.target.files || event.target.files.length === 0) {
            toast({
                variant: 'destructive',
                description: "Please select a file to upload",
            });
            return;
        }

        const file = event.target.files[0];
        setFileName(file.name);

        // Check file size
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            toast({
                variant: 'destructive',
                description: `File size too large (max ${MAX_FILE_SIZE_MB}MB)`,
            });
            return;
        }

        const isValidImage = SUPPORTED_IMAGE_TYPES.includes(file.type);
        const isValidDoc = SUPPORTED_DOC_TYPES.includes(file.type);

        if (!isValidImage && !isValidDoc) {
            toast({
                variant: 'destructive',
                title: "Unsupported File Format",
                description: `Please upload one of these formats: JPEG, PNG, WebP, or PDF`,
            });
            return;
        }

        if (isValidImage) {
            compressImage(file, (compressedFile) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    setBase64Data(reader.result as string);
                };
                reader.onerror = () => {
                    toast({
                        variant: 'destructive',
                        description: "Error reading image file",
                    });
                };
                reader.readAsDataURL(compressedFile);
            });
        } else if (isValidDoc) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setBase64Data(reader.result as string);
            };
            reader.onerror = () => {
                toast({
                    variant: 'destructive',
                    description: "Error reading document file",
                });
            };
            reader.readAsDataURL(file);
        }
    }

    function compressImage(file: File, callback: (compressedFile: File) => void) {
        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                // Set canvas dimensions to match the image
                canvas.width = img.width;
                canvas.height = img.height;

                // Draw the image onto the canvas
                ctx.drawImage(img, 0, 0);

                // Apply compression (adjust quality as needed)
                const quality = 0.7; // Higher quality than before
                const dataURL = canvas.toDataURL('image/jpeg', quality);

                // Convert data URL back to Blob
                const byteString = atob(dataURL.split(',')[1]);
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);
                for (let i = 0; i < byteString.length; i++) {
                    ia[i] = byteString.charCodeAt(i);
                }
                const compressedFile = new File([ab], file.name, { type: 'image/jpeg' });

                callback(compressedFile);
            };
            img.onerror = () => {
                toast({
                    variant: 'destructive',
                    description: "Error processing image",
                });
            };
            img.src = e.target!.result as string;
        };

        reader.onerror = () => {
            toast({
                variant: 'destructive',
                description: "Error reading file",
            });
        };

        reader.readAsDataURL(file);
    }

    async function extractDetails(): Promise<void> {
        if (!base64Data) {
            toast({
                variant: 'destructive',
                title: "No File Selected",
                description: "Please upload a report file first",
            });
            return;
        }
        
        setIsLoading(true);
        toast({
            description: "Analyzing report...",
        });
    
        try {
            const startTime = performance.now();
            
            const response = await fetch("/api/extractreportgemini", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    base64: base64Data,
                }),
            });
    
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Server responded with ${response.status}`);
            }

            const data = await response.json();
            
            // Updated response handling
            const analysisResult = data.result || data.text || data;
            
            if (!analysisResult) {
                throw new Error('Received empty analysis from server');
            }

            // Handle both string and JSON responses
            const formattedResult = typeof analysisResult === 'string' 
                ? analysisResult 
                : JSON.stringify(analysisResult, null, 2);

            const processingTime = ((performance.now() - startTime) / 1000).toFixed(1);
            setReportData(formattedResult);
            onReportConfirmation(formattedResult);
            
            toast({
                title: "Analysis Complete",
                description: `Processed in ${processingTime}s`,
            });
    
        } catch (error: any) {
            console.error("Extraction Error:", error);
            
            toast({
                variant: 'destructive',
                title: "Analysis Failed",
                description: error.message || "Could not process the report",
                duration: 5000,
            });
        } finally {
            setIsLoading(false);
        }
    }
    
    function clearFile() {
        setBase64Data('');
        setFileName('');
        setReportData('');
    }

    return (
        <div className="grid w-full items-start gap-6 overflow-auto p-4 pt-0">
            <fieldset className='relative grid gap-6 rounded-lg border p-4'>
                <legend className="text-sm font-medium">Report</legend>
                {isLoading && (
                    <div className="absolute z-10 h-full w-full bg-card/90 rounded-lg flex flex-col items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
                        <p>Processing your report...</p>
                    </div>
                )}
                
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Input 
                            type="file"
                            id="report-upload"
                            accept={ACCEPTED_FILE_TYPES}
                            onChange={handleReportSelection}
                            className="flex-1"
                            disabled={isLoading}
                        />
                        {base64Data && (
                            <Button 
                                variant="outline" 
                                onClick={clearFile}
                                disabled={isLoading}
                            >
                                Clear
                            </Button>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Supported formats: JPEG, PNG, WebP, PDF (Max {MAX_FILE_SIZE_MB}MB)
                    </p>
                    {fileName && (
                        <p className="text-sm text-green-600">
                            Selected: {fileName}
                        </p>
                    )}
                </div>

                <Button 
                    onClick={extractDetails}
                    disabled={!base64Data || isLoading}
                >
                    {isLoading ? "Processing..." : "1. Upload File"}
                </Button>

                <div className="space-y-2">
                    <Label>Report Summary</Label>
                    <Textarea
                        value={reportData}
                        onChange={(e) => setReportData(e.target.value)}
                        placeholder="Extracted data from the report will appear here. Get better recommendations by providing additional patient history and symptoms..."
                        className="min-h-72 resize-none border-0 p-3 shadow-none focus-visible:ring-0"
                        disabled={isLoading}
                    />
                </div>

                <Button
                    variant="destructive"
                    className="bg-[#D90013]"
                    onClick={() => onReportConfirmation(reportData)}
                    disabled={!reportData || isLoading}
                >
                    2. Looks Good
                </Button>

                <div className='flex flex-row items-center justify-center gap-2 p-4'>
                </div>
            </fieldset>
        </div>
    );
};

export default ReportComponent;