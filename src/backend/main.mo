import OutCall "http-outcalls/outcall";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";

actor {
  let externalIpApiUrls = [
    "https://api.ipify.org?format=json",
    "https://checkip.amazonaws.com/",
    "https://api.my-ip.io/v2/ip.json",
  ];

  let pingTestUrl = "https://www.google.com";
  let speedTestDownloadUrl = "https://ipv4.download.thinkbroadband.com/5MB.zip";

  let geoInfoApiUrls = [
    "https://ipinfo.io/json",
    "https://freegeoip.app/json/",
    "https://ipwhois.app/json/",
  ];

  public type ExternalIpResult = {
    ip : Text;
    timestamp : Int;
  };

  public type IPGeoInfo = {
    ip : Text;
    city : Text;
    region : Text;
    country : Text;
    loc : Text;
    org : Text;
    timezone : Text;
    postal : Text;
  };

  public query ({ caller }) func transform(input : OutCall.TransformationInput) : async OutCall.TransformationOutput {
    OutCall.transform(input);
  };

  public shared ({ caller }) func getExternalIpAddress() : async Text {
    for (apiUrl in externalIpApiUrls.values()) {
      let result : Text = await OutCall.httpGetRequest(apiUrl, [], transform);
      if (not result.isEmpty()) {
        return result;
      };
    };
    Runtime.trap("Failed to fetch external IP from all providers");
  };

  public shared ({ caller }) func measurePingLatency() : async { latencyMs : Int } {
    let startTime = Time.now();
    let response = await OutCall.httpGetRequest(pingTestUrl, [], transform);
    if (not response.isEmpty()) {
      let endTime = Time.now();
      let latencyMs = (endTime - startTime) / 1_000_000;
      return { latencyMs };
    } else {
      Runtime.trap("Ping test failed");
    };
  };

  public shared ({ caller }) func getGeoInfo() : async ?Text {
    for (apiUrl in geoInfoApiUrls.values()) {
      let response = await OutCall.httpGetRequest(apiUrl, [], transform);
      if (not response.isEmpty()) {
        return ?response;
      };
    };
    null;
  };

  public shared ({ caller }) func testDownloadSpeed() : async { speedMbps : Float } {
    let startTime = Time.now();
    let response = await OutCall.httpGetRequest(speedTestDownloadUrl, [], transform);
    if (not response.isEmpty()) {
      let endTime = Time.now();
      let durationMs = (endTime - startTime) / 1_000_000;

      let fileSizeBits = 5 * 1_024 * 1_024 * 8;

      let speedMbps = fileSizeBits.toFloat() / durationMs.toFloat() / 1_000.0;
      return { speedMbps };
    } else {
      Runtime.trap("Download speed test failed");
    };
  };
};
