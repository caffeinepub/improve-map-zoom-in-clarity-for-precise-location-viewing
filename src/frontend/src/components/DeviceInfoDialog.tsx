import { useEffect, useState } from 'react';
import { Smartphone, Monitor, Wifi, WifiOff, Clock, MapPin, Globe, Cpu, HardDrive, Navigation, ChevronDown, ChevronUp, Activity, Gauge, Network } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import type { LocationData } from '../App';
import { useExternalIp, useNetworkLatency } from '../hooks/useQueries';

interface DeviceInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location: LocationData | null;
  onViewLocation?: () => void;
}

interface DeviceInfo {
  deviceName: string;
  deviceModel: string;
  os: string;
  osVersion: string;
  browser: string;
  browserVersion: string;
  renderingEngine: string;
  networkType: string;
  isOnline: boolean;
  platform: string;
  userAgent: string;
  screenResolution: string;
  pixelDensity: number;
  screenOrientation: string;
  deviceMemory?: number;
  hardwareConcurrency?: number;
  cpuArchitecture: string;
  effectiveConnectionType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

function getDeviceInfo(): DeviceInfo {
  const ua = navigator.userAgent;
  
  // Detect OS
  let os = 'Unknown OS';
  let osVersion = '';
  if (ua.includes('Windows NT 10.0')) {
    os = 'Windows';
    osVersion = '10/11';
  } else if (ua.includes('Windows NT 6.3')) {
    os = 'Windows';
    osVersion = '8.1';
  } else if (ua.includes('Windows NT 6.2')) {
    os = 'Windows';
    osVersion = '8';
  } else if (ua.includes('Windows NT 6.1')) {
    os = 'Windows';
    osVersion = '7';
  } else if (ua.includes('Mac OS X')) {
    os = 'macOS';
    const match = ua.match(/Mac OS X ([\d_]+)/);
    if (match) {
      osVersion = match[1].replace(/_/g, '.');
    }
  } else if (ua.includes('Android')) {
    os = 'Android';
    const match = ua.match(/Android ([\d.]+)/);
    if (match) {
      osVersion = match[1];
    }
  } else if (ua.includes('iPhone') || ua.includes('iPad')) {
    os = ua.includes('iPad') ? 'iPadOS' : 'iOS';
    const match = ua.match(/OS ([\d_]+)/);
    if (match) {
      osVersion = match[1].replace(/_/g, '.');
    }
  } else if (ua.includes('Linux')) {
    os = 'Linux';
  }

  // Detect Browser and Rendering Engine
  let browser = 'Unknown Browser';
  let browserVersion = '';
  let renderingEngine = 'Unknown';
  
  if (ua.includes('Edg/')) {
    browser = 'Microsoft Edge';
    renderingEngine = 'Blink';
    const match = ua.match(/Edg\/([\d.]+)/);
    if (match) browserVersion = match[1];
  } else if (ua.includes('Chrome/') && !ua.includes('Edg/')) {
    browser = 'Google Chrome';
    renderingEngine = 'Blink';
    const match = ua.match(/Chrome\/([\d.]+)/);
    if (match) browserVersion = match[1];
  } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
    browser = 'Safari';
    renderingEngine = 'WebKit';
    const match = ua.match(/Version\/([\d.]+)/);
    if (match) browserVersion = match[1];
  } else if (ua.includes('Firefox/')) {
    browser = 'Mozilla Firefox';
    renderingEngine = 'Gecko';
    const match = ua.match(/Firefox\/([\d.]+)/);
    if (match) browserVersion = match[1];
  } else if (ua.includes('Opera/') || ua.includes('OPR/')) {
    browser = 'Opera';
    renderingEngine = 'Blink';
    const match = ua.match(/(?:Opera|OPR)\/([\d.]+)/);
    if (match) browserVersion = match[1];
  }

  // Detect device model
  let deviceModel = 'Unknown Model';
  if (ua.includes('iPhone')) {
    deviceModel = 'iPhone';
  } else if (ua.includes('iPad')) {
    deviceModel = 'iPad';
  } else if (ua.includes('Android')) {
    const match = ua.match(/Android.*;\s([^)]+)\)/);
    if (match) {
      deviceModel = match[1];
    }
  } else if (ua.includes('Windows')) {
    deviceModel = 'Windows PC';
  } else if (ua.includes('Mac')) {
    deviceModel = 'Mac';
  } else if (ua.includes('Linux')) {
    deviceModel = 'Linux PC';
  }

  // CPU Architecture detection
  let cpuArchitecture = 'Unknown';
  if (navigator.platform.includes('Win64') || navigator.platform.includes('x86_64') || navigator.platform.includes('x64')) {
    cpuArchitecture = 'x86_64 (64-bit)';
  } else if (navigator.platform.includes('Win32') || navigator.platform.includes('x86')) {
    cpuArchitecture = 'x86 (32-bit)';
  } else if (navigator.platform.includes('ARM') || ua.includes('ARM')) {
    cpuArchitecture = 'ARM';
  } else if (ua.includes('aarch64') || ua.includes('arm64')) {
    cpuArchitecture = 'ARM64';
  } else if (navigator.platform.includes('Mac')) {
    // Apple Silicon detection
    cpuArchitecture = navigator.hardwareConcurrency && navigator.hardwareConcurrency > 8 ? 'Apple Silicon (ARM64)' : 'Intel x86_64';
  }

  // Network information
  let networkType = 'Unknown';
  let effectiveConnectionType: string | undefined;
  let downlink: number | undefined;
  let rtt: number | undefined;
  let saveData: boolean | undefined;
  
  const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  if (connection) {
    networkType = connection.type || 'Unknown';
    effectiveConnectionType = connection.effectiveType;
    downlink = connection.downlink;
    rtt = connection.rtt;
    saveData = connection.saveData;
    
    // Map network types to readable names
    if (networkType === 'wifi') networkType = 'Wi-Fi';
    else if (networkType === 'cellular') {
      networkType = effectiveConnectionType ? effectiveConnectionType.toUpperCase() : 'Cellular';
    } else if (networkType === 'ethernet') networkType = 'Ethernet';
    else if (networkType === 'bluetooth') networkType = 'Bluetooth';
    else if (networkType === 'wimax') networkType = 'WiMAX';
    else networkType = networkType.toUpperCase();
  }

  // Screen information
  const pixelDensity = window.devicePixelRatio || 1;
  const screenOrientation = window.screen.orientation?.type || 
    (window.innerHeight > window.innerWidth ? 'portrait-primary' : 'landscape-primary');

  return {
    deviceName: deviceModel,
    deviceModel: deviceModel,
    os,
    osVersion,
    browser,
    browserVersion,
    renderingEngine,
    networkType,
    isOnline: navigator.onLine,
    platform: navigator.platform,
    userAgent: ua,
    screenResolution: `${window.screen.width} × ${window.screen.height}`,
    pixelDensity,
    screenOrientation: screenOrientation.replace('-primary', '').replace('-secondary', ''),
    deviceMemory: (navigator as any).deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
    cpuArchitecture,
    effectiveConnectionType,
    downlink,
    rtt,
    saveData,
  };
}

export default function DeviceInfoDialog({ open, onOpenChange, location, onViewLocation }: DeviceInfoDialogProps) {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(getDeviceInfo());
  const [hardwareOpen, setHardwareOpen] = useState(false);
  const [networkOpen, setNetworkOpen] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date());

  // Fetch external IP and network latency
  const { data: externalIp, isLoading: ipLoading } = useExternalIp();
  const { data: networkLatency, isLoading: latencyLoading } = useNetworkLatency();

  // Update device info in real-time
  useEffect(() => {
    if (!open) return;

    const updateDeviceInfo = () => {
      setDeviceInfo(getDeviceInfo());
      setLastUpdateTime(new Date());
    };

    // Update immediately
    updateDeviceInfo();

    // Update every second while dialog is open
    const interval = setInterval(updateDeviceInfo, 1000);

    // Listen for online/offline events
    window.addEventListener('online', updateDeviceInfo);
    window.addEventListener('offline', updateDeviceInfo);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', updateDeviceInfo);
      window.removeEventListener('offline', updateDeviceInfo);
    };
  }, [open]);

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const handleViewLocation = () => {
    if (onViewLocation) {
      onViewLocation();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            Device Information
          </DialogTitle>
          <DialogDescription>
            Comprehensive hardware and network specifications
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* View Last Updated Location Button */}
          {location && onViewLocation && (
            <>
              <Button 
                onClick={handleViewLocation}
                className="w-full gap-2"
                variant="default"
              >
                <Navigation className="h-4 w-4" />
                View Last Updated Location
              </Button>
              <Separator />
            </>
          )}

          {/* Device & Model */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Monitor className="h-4 w-4 text-muted-foreground" />
              Device
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="font-semibold">{deviceInfo.deviceName}</p>
              <p className="text-sm text-muted-foreground">{deviceInfo.deviceModel}</p>
            </div>
          </div>

          <Separator />

          {/* Hardware Specifications - Collapsible */}
          <Collapsible open={hardwareOpen} onOpenChange={setHardwareOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border bg-muted/30 p-3 hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Cpu className="h-4 w-4 text-muted-foreground" />
                Hardware Specifications
              </div>
              {hardwareOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-3">
              {/* CPU */}
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">CPU Architecture</span>
                  <Badge variant="outline">{deviceInfo.cpuArchitecture}</Badge>
                </div>
                {deviceInfo.hardwareConcurrency && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Logical Cores</span>
                    <Badge variant="secondary">{deviceInfo.hardwareConcurrency}</Badge>
                  </div>
                )}
              </div>

              {/* Memory */}
              {deviceInfo.deviceMemory && (
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Approximate RAM</span>
                    <Badge variant="outline">{deviceInfo.deviceMemory} GB</Badge>
                  </div>
                </div>
              )}

              {/* Screen */}
              <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Screen Resolution</span>
                  <Badge variant="outline">{deviceInfo.screenResolution}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Pixel Density (DPR)</span>
                  <Badge variant="secondary">{deviceInfo.pixelDensity}x</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Orientation</span>
                  <Badge variant="secondary" className="capitalize">{deviceInfo.screenOrientation}</Badge>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* Browser and System Information */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Globe className="h-4 w-4 text-muted-foreground" />
              Browser & System
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Browser</span>
                <span className="text-sm font-semibold">{deviceInfo.browser}</span>
              </div>
              {deviceInfo.browserVersion && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Version</span>
                  <Badge variant="outline">{deviceInfo.browserVersion}</Badge>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Rendering Engine</span>
                <Badge variant="secondary">{deviceInfo.renderingEngine}</Badge>
              </div>
              <Separator className="my-2" />
              <div className="flex items-center justify-between">
                <span className="text-sm">Operating System</span>
                <span className="text-sm font-semibold">{deviceInfo.os}</span>
              </div>
              {deviceInfo.osVersion && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Version</span>
                  <Badge variant="outline">{deviceInfo.osVersion}</Badge>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Platform</span>
                <Badge variant="secondary">{deviceInfo.platform}</Badge>
              </div>
            </div>
          </div>

          <Separator />

          {/* Network Specifications - Collapsible */}
          <Collapsible open={networkOpen} onOpenChange={setNetworkOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border bg-muted/30 p-3 hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Network className="h-4 w-4 text-muted-foreground" />
                Network Specifications
              </div>
              {networkOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-3">
              {/* Connection Status */}
              <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Status</span>
                  <Badge variant={deviceInfo.isOnline ? 'default' : 'destructive'} className="gap-1">
                    {deviceInfo.isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                    {deviceInfo.isOnline ? 'Online' : 'Offline'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Connection Type</span>
                  <Badge variant="outline">{deviceInfo.networkType}</Badge>
                </div>
                {deviceInfo.effectiveConnectionType && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Effective Type</span>
                    <Badge variant="secondary">{deviceInfo.effectiveConnectionType.toUpperCase()}</Badge>
                  </div>
                )}
              </div>

              {/* Connection Speed */}
              {(deviceInfo.downlink !== undefined || deviceInfo.rtt !== undefined) && (
                <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                  {deviceInfo.downlink !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium flex items-center gap-1">
                        <Gauge className="h-3 w-3" />
                        Downlink Speed
                      </span>
                      <Badge variant="outline">{deviceInfo.downlink} Mbps</Badge>
                    </div>
                  )}
                  {deviceInfo.rtt !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Round Trip Time</span>
                      <Badge variant="secondary">{deviceInfo.rtt} ms</Badge>
                    </div>
                  )}
                </div>
              )}

              {/* Network Latency (Backend) */}
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium flex items-center gap-1">
                    <Activity className="h-3 w-3" />
                    Network Latency (Ping)
                  </span>
                  {latencyLoading ? (
                    <Skeleton className="h-5 w-16" />
                  ) : (
                    <Badge variant="outline">{networkLatency || 0} ms</Badge>
                  )}
                </div>
              </div>

              {/* External IP Address */}
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">External IP Address</span>
                  {ipLoading ? (
                    <Skeleton className="h-5 w-32" />
                  ) : (
                    <Badge variant="outline" className="font-mono text-xs">
                      {externalIp || 'N/A'}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Data Saver */}
              {deviceInfo.saveData !== undefined && (
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Data Saver Mode</span>
                    <Badge variant={deviceInfo.saveData ? 'default' : 'secondary'}>
                      {deviceInfo.saveData ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* Location Update Time */}
          {location && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                Location Data
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Last Update</span>
                  <span className="text-xs font-mono">{formatTimestamp(location.timestamp)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Coordinates</span>
                  <span className="text-xs font-mono">
                    {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Accuracy</span>
                  <Badge variant="outline">±{location.accuracy.toFixed(0)}m</Badge>
                </div>
              </div>
            </div>
          )}

          {/* Information Update Timestamp */}
          <div className="pt-2 border-t">
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Last updated: {lastUpdateTime.toLocaleTimeString()}</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
