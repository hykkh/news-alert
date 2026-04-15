import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.io.InputStream;

public class TestSSL {
    public static void main(String[] args) throws Exception {
        URL url = new URL("https://repo.maven.apache.org/maven2/com/google/code/gson/gson/2.11.0/gson-2.11.0.jar");
        HttpsURLConnection conn = (HttpsURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        System.out.println("Response: " + conn.getResponseCode());
        InputStream is = conn.getInputStream();
        byte[] buf = new byte[8192];
        int total = 0;
        int n;
        while ((n = is.read(buf)) > 0) total += n;
        System.out.println("Downloaded: " + total + " bytes");
        is.close();
    }
}
